//! Saved relations, kept in relations.json next to the other config files.
//!
//! Read from disk on every call (a few dozen relations at most), written to a
//! temporary file and renamed into place. The app and the MCP server both
//! write, so writes go one at a time.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::error::{AppError, AppResult};

use super::model::Relation;

pub struct RelationsStore {
    path: PathBuf,
    /// Held across a read-modify-write.
    write: Mutex<()>,
}

/// What's on disk.
enum OnDisk {
    Missing,
    Ok(Vec<Relation>),
    /// Not a list of relations; the error says why.
    Corrupt(String),
}

/// Now as ISO 8601 UTC, e.g. `2026-10-17T14:36:00.123Z`.
pub(crate) fn now_iso() -> String {
    bson::DateTime::now()
        .try_to_rfc3339_string()
        .unwrap_or_default()
}

impl RelationsStore {
    pub fn load(config_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(config_dir)?;
        Ok(Self {
            path: config_dir.join("relations.json"),
            write: Mutex::new(()),
        })
    }

    fn read(&self) -> AppResult<OnDisk> {
        if !self.path.exists() {
            return Ok(OnDisk::Missing);
        }
        let raw = fs::read_to_string(&self.path)?;
        Ok(match serde_json::from_str(&raw) {
            Ok(list) => OnDisk::Ok(list),
            Err(e) => OnDisk::Corrupt(e.to_string()),
        })
    }

    /// The saved list; a corrupt file reads as empty and is left as it is
    /// until the next save, which keeps a copy of it first.
    fn read_list(&self) -> AppResult<Vec<Relation>> {
        Ok(match self.read()? {
            OnDisk::Missing => Vec::new(),
            OnDisk::Ok(list) => list,
            OnDisk::Corrupt(why) => {
                log::warn!("relations.json is corrupt, reading it as empty: {why}");
                Vec::new()
            }
        })
    }

    fn write_list(&self, list: &[Relation]) -> AppResult<()> {
        if let OnDisk::Corrupt(_) = self.read()? {
            let backup = self.path.with_extension("json.bak");
            fs::copy(&self.path, &backup)?;
            log::warn!(
                "relations.json was corrupt; kept a copy as {} before saving",
                backup.display()
            );
        }
        let raw = serde_json::to_string_pretty(list)
            .map_err(|e| AppError::InvalidInput(e.to_string()))?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, raw)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    /// Every saved relation and draft.
    pub fn list(&self) -> AppResult<Vec<Relation>> {
        self.read_list()
    }

    pub fn get(&self, id: &str) -> AppResult<Relation> {
        self.read_list()?
            .into_iter()
            .find(|r| r.id == id)
            .ok_or_else(|| AppError::NotFound(format!("relation {id}")))
    }

    /// Inserts or replaces by id (a new id when empty), stamping the dates.
    pub fn upsert(&self, mut relation: Relation) -> AppResult<Relation> {
        let _guard = self.write.lock().unwrap();
        let mut list = self.read_list()?;
        if relation.id.is_empty() {
            relation.id = uuid::Uuid::new_v4().to_string();
        }
        let now = now_iso();
        let existing = list.iter().position(|r| r.id == relation.id);
        relation.created_at = match existing {
            Some(i) if !list[i].created_at.is_empty() => list[i].created_at.clone(),
            _ if !relation.created_at.is_empty() => relation.created_at.clone(),
            _ => now.clone(),
        };
        relation.updated_at = now;
        match existing {
            Some(i) => list[i] = relation.clone(),
            None => list.push(relation.clone()),
        }
        self.write_list(&list)?;
        Ok(relation)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let _guard = self.write.lock().unwrap();
        let mut list = self.read_list()?;
        let before = list.len();
        list.retain(|r| r.id != id);
        if list.len() == before {
            return Err(AppError::NotFound(format!("relation {id}")));
        }
        self.write_list(&list)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::relations::model::{Bridge, Condition, Op, Side};

    pub(crate) fn relation(name: &str) -> Relation {
        Relation {
            id: String::new(),
            name: name.to_string(),
            from: Side {
                conn: "any".into(),
                db: "shop".into(),
                coll: "{tenant}_orders".into(),
            },
            to: Side {
                conn: "cluster".into(),
                db: "logistics".into(),
                coll: "shipments".into(),
            },
            rules: vec![vec![Condition {
                from: "key".into(),
                op: Op::Eq,
                to: "orderRef".into(),
                bridge: Bridge::UuidString,
            }]],
            rule_notes: Vec::new(),
            scope: Vec::new(),
            from_name: "shipments".into(),
            to_name: "order".into(),
            pairs: Default::default(),
            draft: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn store() -> (RelationsStore, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("mongo-studio-relations-{}", uuid::Uuid::new_v4()));
        (RelationsStore::load(&dir).unwrap(), dir)
    }

    #[test]
    fn upsert_assigns_an_id_and_stamps_the_dates() {
        let (store, dir) = store();
        assert!(store.list().unwrap().is_empty());
        let saved = store.upsert(relation("Shipments")).unwrap();
        assert_eq!(saved.id.len(), 36);
        assert!(saved.created_at.ends_with('Z'), "{}", saved.created_at);
        assert!(saved.created_at.contains('T'));
        assert_eq!(saved.created_at, saved.updated_at);
        assert_eq!(store.get(&saved.id).unwrap(), saved);
        assert!(!dir.join("relations.json.tmp").exists());

        // Replacing keeps the id and the creation date, and moves updated_at.
        std::thread::sleep(std::time::Duration::from_millis(5));
        let mut changed = saved.clone();
        changed.name = "Shipments of a order".into();
        changed.created_at = String::new();
        let again = store.upsert(changed).unwrap();
        assert_eq!(again.id, saved.id);
        assert_eq!(again.created_at, saved.created_at);
        assert_ne!(again.updated_at, saved.updated_at);
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Shipments of a order");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn get_and_delete_report_missing_ids() {
        let (store, dir) = store();
        assert!(matches!(store.get("nope"), Err(AppError::NotFound(_))));
        assert!(matches!(store.delete("nope"), Err(AppError::NotFound(_))));
        let a = store.upsert(relation("A")).unwrap();
        let b = store.upsert(relation("B")).unwrap();
        store.delete(&a.id).unwrap();
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, b.id);
        assert!(matches!(store.get(&a.id), Err(AppError::NotFound(_))));
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn a_corrupt_file_reads_as_empty_and_is_backed_up_on_the_next_save() {
        let (store, dir) = store();
        let path = dir.join("relations.json");
        fs::write(&path, "[{ not json").unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(matches!(store.get("x"), Err(AppError::NotFound(_))));
        // Reading doesn't touch it.
        assert_eq!(fs::read_to_string(&path).unwrap(), "[{ not json");
        assert!(!dir.join("relations.json.bak").exists());

        let saved = store.upsert(relation("A")).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("relations.json.bak")).unwrap(),
            "[{ not json"
        );
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, saved.id);
        fs::remove_dir_all(dir).ok();
    }
}
