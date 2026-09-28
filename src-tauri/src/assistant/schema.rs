//! Field paths and BSON types of a document sample - names and types only,
//! never values, so the agent can learn a collection's shape without seeing
//! its data.

use std::collections::{HashMap, HashSet};

use mongodb::bson::{Bson, Document};

/// How deep nested objects are followed; deeper ones show as `object`.
const MAX_DEPTH: usize = 4;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FieldSummary {
    /// Dot-notation path, the way a query names it (`shipping.city`;
    /// fields of objects inside arrays too: `items.sku`).
    pub path: String,
    /// Type names with how many documents had the field with that type,
    /// most common first.
    pub types: Vec<(String, usize)>,
    /// How many documents have the field.
    pub docs: usize,
}

/// The `$type` alias of a BSON value; arrays list their element types,
/// e.g. `array<string|int>`.
pub(crate) fn type_name(value: &Bson) -> String {
    match value {
        Bson::Array(items) => {
            let mut kinds: Vec<&'static str> = Vec::new();
            for item in items {
                let kind = scalar_type_name(item);
                if !kinds.contains(&kind) {
                    kinds.push(kind);
                }
            }
            if kinds.is_empty() {
                "array".to_string()
            } else {
                format!("array<{}>", kinds.join("|"))
            }
        }
        other => scalar_type_name(other).to_string(),
    }
}

fn scalar_type_name(value: &Bson) -> &'static str {
    match value {
        Bson::Double(_) => "double",
        Bson::String(_) => "string",
        Bson::Document(_) => "object",
        Bson::Array(_) => "array",
        Bson::Binary(_) => "binData",
        Bson::Undefined => "undefined",
        Bson::ObjectId(_) => "objectId",
        Bson::Boolean(_) => "bool",
        Bson::DateTime(_) => "date",
        Bson::Null => "null",
        Bson::RegularExpression(_) => "regex",
        Bson::DbPointer(_) => "dbPointer",
        Bson::JavaScriptCode(_) => "javascript",
        Bson::Symbol(_) => "symbol",
        Bson::JavaScriptCodeWithScope(_) => "javascriptWithScope",
        Bson::Int32(_) => "int",
        Bson::Timestamp(_) => "timestamp",
        Bson::Int64(_) => "long",
        Bson::Decimal128(_) => "decimal",
        Bson::MinKey => "minKey",
        Bson::MaxKey => "maxKey",
    }
}

/// What one document has already counted.
#[derive(Default)]
struct Seen {
    paths: HashSet<String>,
    types: HashSet<(String, String)>,
}

#[derive(Default)]
struct Accumulator {
    order: Vec<String>,
    fields: HashMap<String, (Vec<(String, usize)>, usize)>,
}

impl Accumulator {
    fn record(&mut self, path: &str, kind: String, seen: &mut Seen) {
        if !seen.types.insert((path.to_string(), kind.clone())) {
            return;
        }
        let first_in_doc = seen.paths.insert(path.to_string());
        let (types, docs) = self.fields.entry(path.to_string()).or_insert_with(|| {
            self.order.push(path.to_string());
            (Vec::new(), 0)
        });
        if first_in_doc {
            *docs += 1;
        }
        match types.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, count)) => *count += 1,
            None => types.push((kind, 1)),
        }
    }

    fn walk(&mut self, doc: &Document, prefix: &str, depth: usize, seen: &mut Seen) {
        for (key, value) in doc {
            let path = if prefix.is_empty() {
                key.clone()
            } else {
                format!("{prefix}.{key}")
            };
            self.record(&path, type_name(value), seen);
            if depth >= MAX_DEPTH {
                continue;
            }
            match value {
                Bson::Document(inner) => self.walk(inner, &path, depth + 1, seen),
                Bson::Array(items) => {
                    for item in items {
                        if let Bson::Document(inner) = item {
                            self.walk(inner, &path, depth + 1, seen);
                        }
                    }
                }
                _ => {}
            }
        }
    }
}

/// Every field path in `docs` with its types, in first-seen order.
pub(crate) fn infer<'a>(docs: impl IntoIterator<Item = &'a Document>) -> Vec<FieldSummary> {
    let mut acc = Accumulator::default();
    for doc in docs {
        // A field counts once per document, however many array elements
        // carry it.
        let mut seen = Seen::default();
        acc.walk(doc, "", 1, &mut seen);
    }
    let Accumulator { order, mut fields } = acc;
    order
        .into_iter()
        .filter_map(|path| {
            let (mut types, docs) = fields.remove(&path)?;
            // stable: ties keep first-seen order
            types.sort_by_key(|t| std::cmp::Reverse(t.1));
            Some(FieldSummary { path, types, docs })
        })
        .collect()
}

/// One line per field: `shipping.city: string|null (97%)`.
pub(crate) fn render(fields: &[FieldSummary], sampled: usize) -> String {
    fields
        .iter()
        .map(|f| {
            let types: Vec<&str> = f.types.iter().map(|(k, _)| k.as_str()).collect();
            format!(
                "{}: {} ({})",
                f.path,
                types.join("|"),
                share(f.docs, sampled)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn share(count: usize, total: usize) -> String {
    if total == 0 {
        return "0%".to_string();
    }
    let pct = count as f64 * 100.0 / total as f64;
    if count > 0 && pct < 1.0 {
        "<1%".to_string()
    } else if count < total && pct > 99.0 {
        ">99%".to_string()
    } else {
        format!("{}%", pct.round() as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, oid::ObjectId, DateTime};

    #[test]
    fn infers_paths_types_and_shares() {
        let docs = vec![
            doc! {
                "_id": ObjectId::new(),
                "orderNumber": "A-1",
                "total": 10.5,
                "shipping": { "city": "Lisbon", "geo": { "lat": 1.0 } },
                "items": [ { "sku": "x", "qty": 1 }, { "sku": "y", "qty": 2i64 } ],
                "tags": ["a", "b"],
                "notes": "fragile",
                "createdAt": DateTime::now(),
            },
            doc! {
                "_id": ObjectId::new(),
                "orderNumber": "A-2",
                "total": 3,
                "shipping": { "city": null },
                "items": [],
                "tags": [1, "c"],
                "notes": null,
            },
        ];
        let fields = infer(&docs);
        let by_path: HashMap<&str, &FieldSummary> =
            fields.iter().map(|f| (f.path.as_str(), f)).collect();

        assert_eq!(fields[0].path, "_id");
        assert_eq!(by_path["orderNumber"].docs, 2);
        let total: Vec<&str> = by_path["total"]
            .types
            .iter()
            .map(|(k, _)| k.as_str())
            .collect();
        assert_eq!(total, ["double", "int"]);
        assert_eq!(by_path["shipping.geo.lat"].docs, 1);
        // counted once per document although two elements carry it
        assert_eq!(by_path["items.sku"].docs, 1);
        assert_eq!(
            by_path["items.qty"].types,
            [("int".to_string(), 1), ("long".to_string(), 1)]
        );
        assert_eq!(
            by_path["items"].types,
            [("array<object>".to_string(), 1), ("array".to_string(), 1)]
        );
        assert_eq!(by_path["tags"].types[1].0, "array<int|string>");
        assert_eq!(by_path["createdAt"].types[0].0, "date");

        let text = render(&fields, docs.len());
        assert!(text.contains("\nnotes: string|null (100%)"), "{text}");
        assert!(text.contains("\ncreatedAt: date (50%)"), "{text}");
        assert!(
            text.contains("\nshipping.city: string|null (100%)"),
            "{text}"
        );
    }

    #[test]
    fn stops_at_depth_four_and_shows_no_values() {
        let docs = vec![doc! { "a": { "b": { "c": { "d": { "e": { "secret": "hunter2" } } } } } }];
        let fields = infer(&docs);
        let paths: Vec<&str> = fields.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["a", "a.b", "a.b.c", "a.b.c.d"]);
        assert_eq!(fields[3].types[0].0, "object");
        let text = render(&fields, 1);
        assert!(!text.contains("hunter2") && !text.contains("secret"));
    }

    #[test]
    fn shares_round_without_lying_at_the_edges() {
        assert_eq!(share(1, 500), "<1%");
        assert_eq!(share(499, 500), ">99%");
        assert_eq!(share(250, 500), "50%");
        assert_eq!(share(0, 0), "0%");
    }
}
