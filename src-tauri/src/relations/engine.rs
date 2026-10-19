//! Finding the related documents of a page of documents: one query per rule
//! on the other side, never a collection scan or a listCollections.
//!
//! The page's documents are the source; each yields, per rule, constraints
//! on the other side's fields (a field and the values it may hold, or the
//! texts it may start with). Constraints every document shares go to the
//! query root (the `{tenant}` scope, typically); the rest become one `$in`
//! when each document has a single one on the same field, else an `$or` of
//! per-document `$and`s. What comes back is matched to its documents again
//! by comparing canonical texts, since one query serves the whole page.
//!
//! Direction To with a "starts with" condition can't ask MongoDB for "the
//! From values that are a prefix of this text", so it looks for the To value
//! itself and, when it begins with a UUID, that UUID (the suffixed orderRef
//! case: `<uuid>-split` finds the order whose key is `<uuid>`).

use std::collections::HashSet;
use std::time::{Duration, Instant};

use futures_util::TryStreamExt;
use mongodb::bson::{doc, Bson, Document, Regex};
use mongodb::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ejson::{bson_to_json, document_to_json};
use crate::error::{AppError, AppResult};

use super::bridge::{
    canonical, collection_for, convert, fill, is_template, parse_template, placeholders, tenant_of,
    values_at,
};
use super::model::{Aggregate, AggregateKind, Bridge, Condition, Dir, Op, Relation};

/// Where the documents in hand come from.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// Part of the frontend's shape; the other side's client is already
    /// picked by the caller, so the engine doesn't need it.
    #[allow(dead_code)]
    pub connection_id: String,
    pub database: String,
    pub collection: String,
}

/// What one source document found.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    /// How many documents it found.
    pub count: u64,
    /// The rule (index) that found them, None when nothing was found.
    pub rule: Option<usize>,
    /// The first `docs_per_source` of them, as relaxed Extended JSON.
    pub docs: Vec<serde_json::Value>,
    /// Aggregate id -> value (number, boolean, or a field value).
    pub aggregates: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindRelatedOutput {
    /// The collection the other side was read from, e.g. `berlin_orders`.
    pub target_database: String,
    pub target_collection: String,
    /// One per source document, in order.
    pub results: Vec<Found>,
    /// Documents read on the other side in all.
    pub matched: u64,
    /// The read stopped at the cap; counts and aggregates may be low.
    pub truncated: bool,
    pub ms: u64,
}

/// Most documents read on the other side for one page.
pub const MATCH_CAP: i64 = 5000;

/// Server-side limit on each query of the other side.
const MAX_TIME: Duration = Duration::from_secs(15);

/// Finds, for each of `docs` (documents of `source`, on side `dir`), its
/// related documents on the other side through `target` (a client of the
/// other side's connection).
pub async fn find_related(
    target: &Client,
    relation: &Relation,
    dir: Dir,
    source: &Source,
    docs: &[Document],
    aggregates: &[Aggregate],
    docs_per_source: usize,
) -> AppResult<FindRelatedOutput> {
    let reader = MongoReader {
        client: target,
        database: target_side(relation, dir).db.clone(),
    };
    run(
        reader,
        relation,
        dir,
        source,
        docs,
        aggregates,
        docs_per_source,
    )
    .await
}

/// Reads the other side; MongoDB in the app, a list in the tests.
trait Reader {
    /// Up to `limit` documents of `collection` matching `filter`, by `_id`.
    async fn read(
        &mut self,
        collection: &str,
        filter: Document,
        limit: i64,
    ) -> AppResult<Vec<Document>>;
}

struct MongoReader<'a> {
    client: &'a Client,
    database: String,
}

impl Reader for MongoReader<'_> {
    async fn read(
        &mut self,
        collection: &str,
        filter: Document,
        limit: i64,
    ) -> AppResult<Vec<Document>> {
        Ok(self
            .client
            .database(&self.database)
            .collection::<Document>(collection)
            .find(filter)
            .sort(doc! { "_id": 1 })
            .limit(limit)
            .max_time(MAX_TIME)
            .await?
            .try_collect()
            .await?)
    }
}

fn target_side(relation: &Relation, dir: Dir) -> &super::model::Side {
    match dir {
        Dir::From => &relation.to,
        Dir::To => &relation.from,
    }
}

async fn run(
    mut reader: impl Reader,
    relation: &Relation,
    dir: Dir,
    source: &Source,
    docs: &[Document],
    aggregates: &[Aggregate],
    docs_per_source: usize,
) -> AppResult<FindRelatedOutput> {
    let started = Instant::now();
    let rules: Vec<(usize, &Vec<Condition>)> = relation
        .rules
        .iter()
        .enumerate()
        .filter(|(_, rule)| !rule.is_empty())
        .collect();
    if rules.is_empty() {
        return Err(AppError::InvalidInput(
            "the relation has no rule with a condition".to_string(),
        ));
    }
    let source_side = match dir {
        Dir::From => &relation.from,
        Dir::To => &relation.to,
    };
    if source.database != source_side.db {
        return Err(AppError::InvalidInput(format!(
            "the database {} isn't the relation's {} side ({})",
            source.database,
            if dir == Dir::From { "From" } else { "To" },
            source_side.db
        )));
    }
    let groups = groups(relation, dir, &source.collection, docs)?;
    let mut found: Vec<Vec<Document>> = vec![Vec::new(); docs.len()];
    let mut rule_of: Vec<Option<usize>> = vec![None; docs.len()];
    let mut matched: u64 = 0;
    let mut truncated = false;
    let mut remaining = MATCH_CAP;

    for group in &groups {
        // Scope constraints first: a document they rule out finds nothing.
        let mut pending: Vec<(usize, Vec<Constraint>)> = group
            .docs
            .iter()
            .filter_map(|&i| {
                scope_constraints(relation, dir, &docs[i], &group.tenant).map(|s| (i, s))
            })
            .collect();
        for (rule_index, rule) in &rules {
            if pending.is_empty() {
                break;
            }
            if remaining <= 0 {
                truncated = true;
                break;
            }
            let clauses: Vec<(usize, Vec<Constraint>)> = pending
                .iter()
                .filter_map(|(i, scope)| {
                    rule_constraints(dir, rule, &docs[*i], &group.tenant).map(|mut c| {
                        let mut all = scope.clone();
                        all.append(&mut c);
                        (*i, all)
                    })
                })
                .collect();
            if clauses.is_empty() {
                continue;
            }
            let filter = build_filter(clauses.iter().map(|(_, c)| c.as_slice()));
            let mut read = reader
                .read(&group.collection, filter, remaining + 1)
                .await?;
            if read.len() as i64 > remaining {
                truncated = true;
                read.truncate(remaining as usize);
            }
            matched += read.len() as u64;
            remaining -= read.len() as i64;
            let mut done = HashSet::new();
            for (i, constraints) in &clauses {
                let mine: Vec<Document> = read
                    .iter()
                    .filter(|t| constraints.iter().all(|c| c.holds(t)))
                    .cloned()
                    .collect();
                if !mine.is_empty() {
                    found[*i] = mine;
                    rule_of[*i] = Some(*rule_index);
                    done.insert(*i);
                }
            }
            pending.retain(|(i, _)| !done.contains(i));
        }
    }

    let results = found
        .into_iter()
        .zip(rule_of)
        .map(|(docs, rule)| Found {
            count: docs.len() as u64,
            rule,
            aggregates: aggregates
                .iter()
                .map(|a| (a.id.clone(), aggregate(a, &docs)))
                .collect(),
            docs: docs
                .into_iter()
                .take(docs_per_source)
                .map(document_to_json)
                .collect(),
        })
        .collect();

    let side = target_side(relation, dir);
    let mut collections: Vec<&str> = Vec::new();
    for g in &groups {
        if !collections.contains(&g.collection.as_str()) {
            collections.push(&g.collection);
        }
    }
    Ok(FindRelatedOutput {
        target_database: side.db.clone(),
        target_collection: if collections.is_empty() {
            side.coll.clone()
        } else {
            collections.join(", ")
        },
        results,
        matched,
        truncated,
        ms: started.elapsed().as_millis() as u64,
    })
}

/// Source documents that read the same collection of the other side.
#[derive(Debug, Clone, PartialEq)]
struct Group {
    tenant: String,
    collection: String,
    docs: Vec<usize>,
}

/// Which collection of the other side each document reads: the tenant comes
/// from the source collection's name, or (direction To, when the To side
/// isn't a pattern) from the scope field tied to `{tenant}` in each document.
fn groups(
    relation: &Relation,
    dir: Dir,
    source_collection: &str,
    docs: &[Document],
) -> AppResult<Vec<Group>> {
    let all = || (0..docs.len()).collect::<Vec<_>>();
    let mismatch = |side: &str, pattern: &str| {
        AppError::InvalidInput(format!(
            "the collection {source_collection} isn't the relation's {side} side ({pattern})"
        ))
    };
    match dir {
        Dir::From => {
            let tenant = tenant_of(&relation.from.coll, source_collection)
                .ok_or_else(|| mismatch("From", &relation.from.coll))?;
            if tenant.is_empty() && relation.to.coll.contains("{tenant}") {
                return Err(AppError::InvalidInput(format!(
                    "the To side ({}) needs a tenant, but the From side ({}) has no {{tenant}} part",
                    relation.to.coll, relation.from.coll
                )));
            }
            Ok(vec![Group {
                collection: collection_for(&relation.to.coll, &tenant),
                tenant,
                docs: all(),
            }])
        }
        Dir::To => {
            let tenant = tenant_of(&relation.to.coll, source_collection)
                .ok_or_else(|| mismatch("To", &relation.to.coll))?;
            if !tenant.is_empty() || !relation.from.coll.contains("{tenant}") {
                return Ok(vec![Group {
                    collection: collection_for(&relation.from.coll, &tenant),
                    tenant,
                    docs: all(),
                }]);
            }
            let field = relation
                .scope
                .iter()
                .find(|s| s.value == "{tenant}")
                .map(|s| s.to.as_str())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "the From side ({}) is one collection per tenant, but no scope filter \
                         says which To field holds the tenant",
                        relation.from.coll
                    ))
                })?;
            let mut groups: Vec<Group> = Vec::new();
            for (i, doc) in docs.iter().enumerate() {
                let Some(tenant) = values_at(doc, field)
                    .first()
                    .and_then(canonical)
                    .filter(|t| !t.is_empty())
                else {
                    continue;
                };
                match groups.iter_mut().find(|g| g.tenant == tenant) {
                    Some(g) => g.docs.push(i),
                    None => groups.push(Group {
                        collection: collection_for(&relation.from.coll, &tenant),
                        tenant,
                        docs: vec![i],
                    }),
                }
            }
            Ok(groups)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum How {
    /// The field holds one of the values.
    Exact,
    /// The field's text starts with one of the values (texts).
    Prefix,
}

/// A field of the other side and what it may hold, for one source document.
#[derive(Debug, Clone, PartialEq)]
struct Constraint {
    field: String,
    values: Vec<Bson>,
    how: How,
}

/// A value's identity, type included (`"1"` isn't `1` to MongoDB).
fn bson_key(value: &Bson) -> String {
    value.clone().into_relaxed_extjson().to_string()
}

/// The text values compare by when matching back: canonical, else JSON.
fn match_key(value: &Bson) -> String {
    canonical(value).unwrap_or_else(|| bson_key(value))
}

impl Constraint {
    fn new(field: &str, values: Vec<Bson>, how: How) -> Option<Self> {
        let mut seen = HashSet::new();
        let values: Vec<Bson> = values
            .into_iter()
            .filter(|v| !matches!(v, Bson::Null | Bson::Undefined))
            .filter(|v| how == How::Exact || matches!(v, Bson::String(s) if !s.is_empty()))
            .filter(|v| seen.insert(bson_key(v)))
            .collect();
        (!field.is_empty() && !values.is_empty()).then(|| Self {
            field: field.to_string(),
            values,
            how,
        })
    }

    /// Identifies it among the page's constraints.
    fn signature(&self) -> String {
        let mut keys: Vec<String> = self.values.iter().map(bson_key).collect();
        keys.sort();
        format!(
            "{}\u{0}{:?}\u{0}{}",
            self.field,
            self.how,
            keys.join("\u{0}")
        )
    }

    fn filter_value(&self) -> Bson {
        let values: Vec<Bson> = match self.how {
            How::Exact => self.values.clone(),
            How::Prefix => self
                .values
                .iter()
                .filter_map(|v| match v {
                    Bson::String(s) => prefix_regex(s),
                    _ => None,
                })
                .collect(),
        };
        match values.len() {
            1 => values.into_iter().next().unwrap(),
            _ => Bson::Document(doc! { "$in": values }),
        }
    }

    fn filter(&self) -> Document {
        let mut d = Document::new();
        d.insert(self.field.clone(), self.filter_value());
        d
    }

    /// Whether a document of the other side satisfies it.
    fn holds(&self, target: &Document) -> bool {
        let wanted: Vec<String> = self.values.iter().map(match_key).collect();
        values_at(target, &self.field).iter().any(|v| {
            let have = match_key(v);
            match self.how {
                How::Exact => wanted.contains(&have),
                How::Prefix => wanted.iter().any(|w| have.starts_with(w.as_str())),
            }
        })
    }
}

/// `^<text>`, the text escaped. None for text MongoDB can't hold in a
/// regex (a NUL character).
fn prefix_regex(text: &str) -> Option<Bson> {
    Some(Bson::RegularExpression(Regex {
        pattern: format!("^{}", escape_regex(text)).try_into().ok()?,
        options: String::new().try_into().ok()?,
    }))
}

/// Escapes a text for an anchored regex.
fn escape_regex(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if "\\.^$|?*+()[]{}/".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// A dashed UUID text.
fn is_uuid_text(text: &str) -> bool {
    text.len() == 36
        && text.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// The scope filters for one source document: constraints on the other side
/// (direction From, or To with From fields in the value), None when the
/// document can't match (a value can't be filled, or - direction To - the
/// document's own field isn't the tenant).
fn scope_constraints(
    relation: &Relation,
    dir: Dir,
    doc: &Document,
    tenant: &str,
) -> Option<Vec<Constraint>> {
    let mut out = Vec::new();
    for s in &relation.scope {
        match dir {
            Dir::From => {
                let value = fill(&s.value, Some(doc), Some(tenant))?;
                out.push(Constraint::new(
                    &s.to,
                    vec![Bson::String(value)],
                    How::Exact,
                )?);
            }
            Dir::To => {
                if placeholders(&s.value).iter().all(|p| p == "tenant") {
                    let want = fill(&s.value, None, Some(tenant))?;
                    if !values_at(doc, &s.to)
                        .iter()
                        .any(|v| canonical(v).as_deref() == Some(want.as_str()))
                    {
                        return None;
                    }
                } else {
                    // `{field}` of the From document: a condition like any other.
                    let c = Condition {
                        from: s.value.replace("{tenant}", tenant),
                        op: Op::Eq,
                        to: s.to.clone(),
                        bridge: Bridge::AsStored,
                    };
                    out.extend(condition_constraints(Dir::To, &c, doc, tenant)?);
                }
            }
        }
    }
    Some(out)
}

/// A rule's constraints for one source document; None when the rule doesn't
/// apply to it (a value is missing, a template doesn't fit).
fn rule_constraints(
    dir: Dir,
    rule: &[Condition],
    doc: &Document,
    tenant: &str,
) -> Option<Vec<Constraint>> {
    let mut out = Vec::new();
    for c in rule {
        out.extend(condition_constraints(dir, c, doc, tenant)?);
    }
    (!out.is_empty()).then_some(out)
}

fn condition_constraints(
    dir: Dir,
    c: &Condition,
    doc: &Document,
    tenant: &str,
) -> Option<Vec<Constraint>> {
    match dir {
        Dir::From => {
            let values = if is_template(&c.from) {
                vec![Bson::String(fill(&c.from, Some(doc), Some(tenant))?)]
            } else {
                values_at(doc, &c.from)
            };
            let converted = values.iter().map(|v| convert(v, c.bridge));
            let constraint = if c.op == Op::Prefix {
                let texts = converted
                    .filter_map(|v| match v {
                        Bson::String(s) => Some(s),
                        other => canonical(&other),
                    })
                    .map(Bson::String)
                    .collect();
                Constraint::new(&c.to, texts, How::Prefix)?
            } else {
                Constraint::new(&c.to, converted.collect(), How::Exact)?
            };
            Some(vec![constraint])
        }
        Dir::To => {
            let values = values_at(doc, &c.to);
            if is_template(&c.from) {
                // `{customerId}-{key}` on "<customer>-<key>": one equality per placeholder.
                let mut parts: Vec<(String, Vec<Bson>)> = Vec::new();
                for text in values.iter().filter_map(canonical) {
                    let Some(map) = parse_template(&c.from, &text) else {
                        continue;
                    };
                    if map.get("tenant").is_some_and(|t| t != tenant) {
                        continue;
                    }
                    for name in placeholders(&c.from) {
                        if name == "tenant" {
                            continue;
                        }
                        let value = convert(&Bson::String(map[&name].clone()), c.bridge);
                        match parts.iter_mut().find(|(n, _)| *n == name) {
                            Some((_, vs)) => vs.push(value),
                            None => parts.push((name, vec![value])),
                        }
                    }
                }
                if parts.is_empty() {
                    return None;
                }
                parts
                    .into_iter()
                    .map(|(field, vs)| Constraint::new(&field, vs, How::Exact))
                    .collect()
            } else if c.op == Op::Prefix {
                let mut candidates = Vec::new();
                for text in values.iter().filter_map(canonical) {
                    if text.len() > 36 && text.is_char_boundary(36) && is_uuid_text(&text[..36]) {
                        candidates.push(convert(&Bson::String(text[..36].to_string()), c.bridge));
                    }
                    candidates.push(convert(&Bson::String(text), c.bridge));
                }
                Some(vec![Constraint::new(&c.from, candidates, How::Exact)?])
            } else {
                let converted = values.iter().map(|v| convert(v, c.bridge)).collect();
                Some(vec![Constraint::new(&c.from, converted, How::Exact)?])
            }
        }
    }
}

/// One query for the page: what every document shares at the root, then one
/// `$in` or an `$or` of per-document `$and`s.
fn build_filter<'a>(clauses: impl Iterator<Item = &'a [Constraint]>) -> Document {
    let clauses: Vec<&[Constraint]> = clauses.collect();
    let signatures: Vec<HashSet<String>> = clauses
        .iter()
        .map(|c| c.iter().map(Constraint::signature).collect())
        .collect();
    let shared: Vec<&Constraint> = match clauses.first() {
        Some(first) => first
            .iter()
            .filter(|c| {
                let sig = c.signature();
                signatures.iter().all(|s| s.contains(&sig))
            })
            .collect(),
        None => Vec::new(),
    };
    let shared_sigs: HashSet<String> = shared.iter().map(|c| c.signature()).collect();
    let mut rest: Vec<Vec<&Constraint>> = Vec::new();
    let mut seen = HashSet::new();
    let mut vacuous = false;
    for clause in &clauses {
        let own: Vec<&Constraint> = clause
            .iter()
            .filter(|c| !shared_sigs.contains(&c.signature()))
            .collect();
        if own.is_empty() {
            // This document needs only what's shared: no narrowing is possible.
            vacuous = true;
            break;
        }
        let key: Vec<String> = own.iter().map(|c| c.signature()).collect();
        if seen.insert(key.join("\u{1}")) {
            rest.push(own);
        }
    }

    let mut parts: Vec<Document> = shared.iter().map(|c| c.filter()).collect();
    if !vacuous && !rest.is_empty() {
        let single_field = rest
            .iter()
            .all(|r| r.len() == 1 && r[0].field == rest[0][0].field && r[0].how == rest[0][0].how);
        if single_field {
            let first = rest[0][0];
            let merged = Constraint::new(
                &first.field,
                rest.iter().flat_map(|r| r[0].values.clone()).collect(),
                first.how,
            )
            .expect("the merged values aren't empty");
            parts.push(merged.filter());
        } else {
            let alternatives: Vec<Document> = rest
                .iter()
                .map(|r| match r.as_slice() {
                    [one] => one.filter(),
                    many => doc! { "$and": many.iter().map(|c| c.filter()).collect::<Vec<_>>() },
                })
                .collect();
            parts.push(doc! { "$or": alternatives });
        }
    }

    // One document when the keys don't collide, else an explicit `$and`.
    let mut merged = Document::new();
    for part in &parts {
        if part.keys().any(|k| merged.contains_key(k)) {
            return doc! { "$and": parts };
        }
        merged.extend(part.clone());
    }
    merged
}

/// Whether a found document passes an aggregate's `where`.
fn where_holds(agg: &Aggregate, doc: &Document) -> bool {
    let (Some(field), Some(want)) = (agg.where_field.as_deref(), agg.where_value.as_ref()) else {
        return true;
    };
    let want_text = Bson::try_from(want.clone())
        .ok()
        .and_then(|b| canonical(&b));
    values_at(doc, field)
        .iter()
        .any(|v| match (canonical(v), &want_text) {
            (Some(have), Some(want)) => &have == want,
            _ => &bson_to_json(v.clone()) == want,
        })
}

fn number(value: &Bson) -> Option<f64> {
    match value {
        Bson::Int32(n) => Some(*n as f64),
        Bson::Int64(n) => Some(*n as f64),
        Bson::Double(f) => Some(*f),
        Bson::Decimal128(d) => d.to_string().parse().ok(),
        _ => None,
    }
}

/// A field's value as stored: walks documents, and takes the first value
/// when the path goes through an array.
fn value_at(doc: &Document, path: &str) -> Option<Bson> {
    let mut current = doc;
    let parts: Vec<&str> = path.split('.').collect();
    for (i, part) in parts.iter().enumerate() {
        match current.get(*part)? {
            Bson::Document(d) if i + 1 < parts.len() => current = d,
            v if i + 1 == parts.len() => return Some(v.clone()),
            _ => return values_at(doc, path).into_iter().next(),
        }
    }
    None
}

/// An aggregate over what one source document found.
fn aggregate(agg: &Aggregate, found: &[Document]) -> Value {
    let mut passing = found.iter().filter(|d| where_holds(agg, d));
    match agg.kind {
        AggregateKind::Count => Value::from(passing.count() as u64),
        AggregateKind::Exists => Value::Bool(passing.next().is_some()),
        AggregateKind::Sum => {
            let Some(field) = agg.field.as_deref() else {
                return Value::Null;
            };
            let sum: f64 = passing
                .flat_map(|d| values_at(d, field))
                .filter_map(|v| number(&v))
                .sum();
            if sum.fract() == 0.0 && sum.abs() < 9_007_199_254_740_992.0 {
                Value::from(sum as i64)
            } else {
                serde_json::Number::from_f64(sum)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            }
        }
        AggregateKind::First => {
            let Some(field) = agg.field.as_deref() else {
                return Value::Null;
            };
            passing
                .next()
                .and_then(|d| value_at(d, field))
                .map(bson_to_json)
                .unwrap_or(Value::Null)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relations::model::{ScopeFilter, Side};
    use bson::spec::BinarySubtype;
    use bson::Binary;
    use serde_json::json;
    use std::collections::HashMap;

    const CUSTOMER: &str = "eed4b0b7-04c8-4597-b3e7-b394b1192a20";
    const KEY1: &str = "47160a27-7f72-476b-9874-a39c71bec7e3";
    const KEY2: &str = "0b1d6c3e-5a2f-4e8b-9d71-2c4f8a6e9b10";

    fn uuid(text: &str) -> Bson {
        convert(&Bson::String(text.into()), Bridge::UuidString)
    }

    fn cond(from: &str, op: Op, to: &str, bridge: Bridge) -> Condition {
        Condition {
            from: from.into(),
            op,
            to: to.into(),
            bridge,
        }
    }

    /// Orders (one collection per tenant) -> shipments (shared, store).
    fn shipments() -> Relation {
        Relation {
            id: "r1".into(),
            name: "Shipments".into(),
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
            rules: vec![vec![
                cond("customerId", Op::Eq, "customerId", Bridge::UuidString),
                cond("key", Op::Prefix, "orderRef", Bridge::UuidString),
            ]],
            rule_notes: Vec::new(),
            scope: vec![ScopeFilter {
                to: "store".into(),
                value: "{tenant}".into(),
            }],
            from_name: "shipments".into(),
            to_name: "order".into(),
            pairs: HashMap::new(),
            draft: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    /// Orders -> parcels: key + secondaryKey, else externalId.
    fn parcels() -> Relation {
        let mut r = shipments();
        r.to.coll = "parcels".into();
        r.rules = vec![
            vec![
                cond("customerId", Op::Eq, "key", Bridge::UuidString),
                cond("key", Op::Eq, "secondaryKey", Bridge::UuidString),
            ],
            vec![cond(
                "{customerId}-{key}",
                Op::Eq,
                "externalId",
                Bridge::UuidString,
            )],
        ];
        r
    }

    fn source(coll: &str) -> Source {
        Source {
            connection_id: "c1".into(),
            database: "shop".into(),
            collection: coll.into(),
        }
    }

    #[test]
    fn one_condition_over_the_page_is_an_in_with_the_shared_scope_at_the_root() {
        let mut r = shipments();
        r.rules = vec![vec![cond("key", Op::Eq, "orderRef", Bridge::UuidString)]];
        let docs = [
            doc! { "key": uuid(KEY1) },
            doc! { "key": uuid(KEY2) },
            doc! { "key": uuid(KEY1) },
        ];
        let clauses: Vec<Vec<Constraint>> = docs
            .iter()
            .map(|d| {
                let mut c = scope_constraints(&r, Dir::From, d, "berlin").unwrap();
                c.extend(rule_constraints(Dir::From, &r.rules[0], d, "berlin").unwrap());
                c
            })
            .collect();
        let filter = build_filter(clauses.iter().map(Vec::as_slice));
        assert_eq!(
            filter,
            doc! { "store": "berlin", "orderRef": { "$in": [KEY1, KEY2] } }
        );
    }

    #[test]
    fn several_conditions_are_an_or_of_ands_and_prefix_is_an_anchored_regex() {
        let r = shipments();
        let docs = [
            doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY1) },
            doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY2) },
        ];
        let clauses: Vec<Vec<Constraint>> = docs
            .iter()
            .map(|d| {
                let mut c = scope_constraints(&r, Dir::From, d, "berlin").unwrap();
                c.extend(rule_constraints(Dir::From, &r.rules[0], d, "berlin").unwrap());
                c
            })
            .collect();
        let filter = build_filter(clauses.iter().map(Vec::as_slice));
        // The customer is the same for both: it joins the scope at the root.
        assert_eq!(
            filter,
            doc! {
                "store": "berlin",
                "customerId": CUSTOMER,
                "orderRef": { "$in": [
                    prefix_regex(KEY1).unwrap(),
                    prefix_regex(KEY2).unwrap(),
                ] },
            }
        );

        let other_room = "11111111-2222-4333-8444-555555555555";
        let docs = [
            doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY1) },
            doc! { "customerId": uuid(other_room), "key": uuid(KEY2) },
        ];
        let clauses: Vec<Vec<Constraint>> = docs
            .iter()
            .map(|d| rule_constraints(Dir::From, &r.rules[0], d, "berlin").unwrap())
            .collect();
        let filter = build_filter(clauses.iter().map(Vec::as_slice));
        assert_eq!(
            filter,
            doc! { "$or": [
                { "$and": [
                    { "customerId": CUSTOMER },
                    { "orderRef": prefix_regex(KEY1).unwrap() },
                ] },
                { "$and": [
                    { "customerId": other_room },
                    { "orderRef": prefix_regex(KEY2).unwrap() },
                ] },
            ] }
        );
        assert_eq!(escape_regex("a.b*c(d)"), "a\\.b\\*c\\(d\\)");
    }

    #[test]
    fn backwards_a_template_parses_into_one_equality_per_placeholder() {
        let r = parcels();
        let row = doc! { "externalId": format!("{CUSTOMER}-{KEY1}"), "store": "berlin" };
        let c = rule_constraints(Dir::To, &r.rules[1], &row, "berlin").unwrap();
        assert_eq!(
            c,
            vec![
                Constraint::new("customerId", vec![uuid(CUSTOMER)], How::Exact).unwrap(),
                Constraint::new("key", vec![uuid(KEY1)], How::Exact).unwrap(),
            ]
        );
        // Rule 1 doesn't apply to a row without key/secondaryKey...
        assert!(rule_constraints(Dir::To, &r.rules[0], &row, "berlin").is_none());
        // ...nor rule 2 to text that doesn't fit the template.
        let odd = doc! { "externalId": "nope" };
        assert!(rule_constraints(Dir::To, &r.rules[1], &odd, "berlin").is_none());
        // Forwards, the template fills from the order.
        let order = doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY1) };
        let c = rule_constraints(Dir::From, &r.rules[1], &order, "berlin").unwrap();
        assert_eq!(
            c[0].values,
            vec![Bson::String(format!("{CUSTOMER}-{KEY1}"))]
        );
    }

    #[test]
    fn backwards_prefix_looks_for_the_text_and_its_leading_uuid() {
        let r = shipments();
        let shipment =
            doc! { "customerId": CUSTOMER, "orderRef": format!("{KEY1}-split"), "store": "berlin" };
        let c = rule_constraints(Dir::To, &r.rules[0], &shipment, "berlin").unwrap();
        assert_eq!(
            c[0],
            Constraint::new("customerId", vec![uuid(CUSTOMER)], How::Exact).unwrap()
        );
        assert_eq!(c[1].field, "key");
        assert_eq!(
            c[1].values,
            vec![uuid(KEY1), Bson::String(format!("{KEY1}-split"))]
        );
        // A shipment whose store isn't the tenant can't match.
        let elsewhere = doc! { "customerId": CUSTOMER, "orderRef": KEY1, "store": "acme" };
        assert!(scope_constraints(&r, Dir::To, &elsewhere, "berlin").is_none());
        assert_eq!(
            scope_constraints(&r, Dir::To, &shipment, "berlin"),
            Some(vec![])
        );
    }

    #[test]
    fn matching_back_compares_canonical_texts_per_condition() {
        let exact =
            Constraint::new("orderRef", vec![Bson::String(KEY1.into())], How::Exact).unwrap();
        assert!(exact.holds(&doc! { "orderRef": KEY1 }));
        assert!(!exact.holds(&doc! { "orderRef": KEY2 }));
        // A Binary UUID and its text are the same value.
        assert!(exact.holds(&doc! { "orderRef": uuid(KEY1) }));
        let prefix =
            Constraint::new("orderRef", vec![Bson::String(KEY1.into())], How::Prefix).unwrap();
        assert!(prefix.holds(&doc! { "orderRef": format!("{KEY1}-x") }));
        assert!(!prefix.holds(&doc! { "other": KEY1 }));
        // Arrays: any element.
        let inside = Constraint::new("ids", vec![Bson::Int32(3)], How::Exact).unwrap();
        assert!(inside.holds(&doc! { "ids": [1, 2, 3] }));
        // Nulls and empty prefixes never become constraints.
        assert!(Constraint::new("a", vec![Bson::Null], How::Exact).is_none());
        assert!(Constraint::new("a", vec![Bson::String(String::new())], How::Prefix).is_none());
    }

    #[test]
    fn groups_by_tenant_from_the_name_or_the_scope_field() {
        let r = shipments();
        let g = groups(&r, Dir::From, "berlin_orders", &[doc! {}, doc! {}]).unwrap();
        assert_eq!(g.len(), 1);
        assert_eq!(
            (g[0].tenant.as_str(), g[0].collection.as_str()),
            ("berlin", "shipments")
        );
        assert!(groups(&r, Dir::From, "berlin_customers", &[]).is_err());

        let docs = [
            doc! { "store": "berlin" },
            doc! { "store": "acme" },
            doc! {},
            doc! { "store": "berlin" },
        ];
        let g = groups(&r, Dir::To, "shipments", &docs).unwrap();
        assert_eq!(
            g,
            vec![
                Group {
                    tenant: "berlin".into(),
                    collection: "berlin_orders".into(),
                    docs: vec![0, 3]
                },
                Group {
                    tenant: "acme".into(),
                    collection: "acme_orders".into(),
                    docs: vec![1]
                },
            ]
        );
        let mut unscoped = r.clone();
        unscoped.scope.clear();
        assert!(groups(&unscoped, Dir::To, "shipments", &docs).is_err());
    }

    #[test]
    fn aggregates_per_source_document() {
        let found = vec![
            doc! { "status": "DELIVERED", "weight": 2, "at": { "d": 1 } },
            doc! { "status": "DELIVERED", "weight": 1.5 },
            doc! { "status": "RETURNED", "weight": bson::Bson::Int64(4) },
            doc! { "status": "DELIVERED", "weight": "n/a" },
        ];
        let agg = |kind, field: Option<&str>, w: Option<(&str, Value)>| Aggregate {
            id: "a".into(),
            kind,
            field: field.map(str::to_string),
            where_field: w.as_ref().map(|(f, _)| f.to_string()),
            where_value: w.map(|(_, v)| v),
        };
        assert_eq!(
            aggregate(&agg(AggregateKind::Count, None, None), &found),
            json!(4)
        );
        assert_eq!(
            aggregate(
                &agg(
                    AggregateKind::Count,
                    None,
                    Some(("status", json!("DELIVERED")))
                ),
                &found
            ),
            json!(3)
        );
        assert_eq!(
            aggregate(&agg(AggregateKind::Sum, Some("weight"), None), &found),
            json!(7.5)
        );
        assert_eq!(
            aggregate(
                &agg(
                    AggregateKind::Sum,
                    Some("weight"),
                    Some(("status", json!("RETURNED")))
                ),
                &found
            ),
            json!(4)
        );
        assert_eq!(
            aggregate(&agg(AggregateKind::Exists, None, None), &found),
            json!(true)
        );
        assert_eq!(
            aggregate(&agg(AggregateKind::Exists, None, None), &[]),
            json!(false)
        );
        assert_eq!(
            aggregate(
                &agg(
                    AggregateKind::Exists,
                    None,
                    Some(("status", json!("PENDING")))
                ),
                &found
            ),
            json!(false)
        );
        assert_eq!(
            aggregate(&agg(AggregateKind::First, Some("at"), None), &found),
            json!({ "d": 1 })
        );
        assert_eq!(
            aggregate(
                &agg(
                    AggregateKind::First,
                    Some("status"),
                    Some(("weight", json!(4)))
                ),
                &found
            ),
            json!("RETURNED")
        );
        assert_eq!(
            aggregate(&agg(AggregateKind::First, Some("x"), None), &[]),
            Value::Null
        );
    }

    /// The other side as lists; returns every document of the collection so
    /// the matching back does the work, and records the filters.
    struct Memory {
        collections: HashMap<String, Vec<Document>>,
        filters: Vec<(String, Document)>,
    }

    impl Reader for &mut Memory {
        async fn read(
            &mut self,
            collection: &str,
            filter: Document,
            limit: i64,
        ) -> AppResult<Vec<Document>> {
            self.filters.push((collection.to_string(), filter));
            Ok(self
                .collections
                .get(collection)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .take(limit as usize)
                .collect())
        }
    }

    #[tokio::test]
    async fn the_next_rule_runs_only_for_documents_the_earlier_ones_left_empty() {
        let r = parcels();
        let rows = vec![
            doc! { "_id": 1, "key": CUSTOMER, "secondaryKey": KEY1, "store": "berlin" },
            doc! { "_id": 2, "externalId": format!("{CUSTOMER}-{KEY2}"), "store": "berlin" },
            doc! { "_id": 3, "externalId": format!("{CUSTOMER}-{KEY1}"), "store": "berlin" },
        ];
        let mut memory = Memory {
            collections: HashMap::from([("parcels".to_string(), rows)]),
            filters: Vec::new(),
        };
        let orders = [
            doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY1) },
            doc! { "customerId": uuid(CUSTOMER), "key": uuid(KEY2) },
            doc! { "customerId": uuid(CUSTOMER) },
        ];
        let out = run(
            &mut memory,
            &r,
            Dir::From,
            &source("berlin_orders"),
            &orders,
            &[],
            5,
        )
        .await
        .unwrap();
        // Order 1 found its row by rule 1 (not also the externalId row:
        // rule 2 never ran for it); order 2 only by rule 2; order 3 nothing.
        assert_eq!(out.results[0].rule, Some(0));
        assert_eq!(out.results[0].count, 1);
        assert_eq!(out.results[0].docs[0]["_id"], json!(1));
        assert_eq!(out.results[1].rule, Some(1));
        assert_eq!(out.results[1].docs[0]["_id"], json!(2));
        assert_eq!(out.results[2].rule, None);
        assert_eq!(out.results[2].count, 0);
        assert_eq!(memory.filters.len(), 2);
        // Rule 2 asked only for order 2 (order 3 has no key to fill).
        assert_eq!(
            memory.filters[1].1,
            doc! { "store": "berlin", "externalId": format!("{CUSTOMER}-{KEY2}") }
        );
        assert_eq!(out.target_collection, "parcels");
        assert_eq!(out.matched, 6);
        assert!(!out.truncated);
    }

    #[tokio::test]
    async fn the_cap_stops_the_read_and_says_so() {
        let mut r = shipments();
        r.rules = vec![vec![cond("key", Op::Eq, "orderRef", Bridge::UuidString)]];
        let many: Vec<Document> = (0..MATCH_CAP + 10)
            .map(|i| doc! { "_id": i, "orderRef": KEY1, "store": "berlin" })
            .collect();
        let mut memory = Memory {
            collections: HashMap::from([("shipments".to_string(), many)]),
            filters: Vec::new(),
        };
        let out = run(
            &mut memory,
            &r,
            Dir::From,
            &source("berlin_orders"),
            &[doc! { "key": uuid(KEY1) }],
            &[],
            2,
        )
        .await
        .unwrap();
        assert!(out.truncated);
        assert_eq!(out.matched, MATCH_CAP as u64);
        assert_eq!(out.results[0].count, MATCH_CAP as u64);
        assert_eq!(out.results[0].docs.len(), 2);
    }

    #[test]
    fn binary_uuids_reach_the_query_as_text() {
        let c = cond("key", Op::Eq, "orderRef", Bridge::UuidString);
        let order = doc! { "key": Bson::Binary(Binary { subtype: BinarySubtype::Uuid, bytes: vec![0x47, 0x16, 0x0a, 0x27, 0x7f, 0x72, 0x47, 0x6b, 0x98, 0x74, 0xa3, 0x9c, 0x71, 0xbe, 0xc7, 0xe3] }) };
        let out = condition_constraints(Dir::From, &c, &order, "berlin").unwrap();
        assert_eq!(out[0].values, vec![Bson::String(KEY1.into())]);
        assert!(is_uuid_text(KEY1));
        assert!(!is_uuid_text("47160a27-7f72-476b-9874-a39c71bec7eZ"));
    }
}

#[cfg(test)]
pub(crate) mod live_tests {
    //! Against a live MongoDB named by `MONGO_STUDIO_TEST_URI`, on fixture
    //! databases (`studio_rel_*`) created and dropped by each test. Two
    //! clients to the same server stand for two saved connections. Run with:
    //!   MONGO_STUDIO_TEST_URI=mongodb://localhost:27017 \
    //!     cargo test --lib -- --ignored relations
    use super::*;
    use crate::relations::model::{ScopeFilter, Side};
    use serde_json::json;
    use std::collections::HashMap;

    pub(crate) const CUSTOMER: &str = "eed4b0b7-04c8-4597-b3e7-b394b1192a20";
    pub(crate) const OTHER_CUSTOMER: &str = "11111111-2222-4333-8444-555555555555";
    pub(crate) const K1: &str = "47160a27-7f72-476b-9874-a39c71bec7e3";
    pub(crate) const K2: &str = "0b1d6c3e-5a2f-4e8b-9d71-2c4f8a6e9b10";
    pub(crate) const K3: &str = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    /// An acme order with the same key as a berlin one.
    pub(crate) const K4: &str = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    fn uuid(text: &str) -> Bson {
        convert(&Bson::String(text.into()), Bridge::UuidString)
    }

    pub(crate) fn uri() -> String {
        std::env::var("MONGO_STUDIO_TEST_URI").expect("set MONGO_STUDIO_TEST_URI to run this test")
    }

    fn cond(from: &str, op: Op, to: &str) -> Condition {
        Condition {
            from: from.into(),
            op,
            to: to.into(),
            bridge: Bridge::UuidString,
        }
    }

    pub(crate) fn relation(
        shop: &str,
        logistics: &str,
        to_coll: &str,
        rules: Vec<Vec<Condition>>,
    ) -> Relation {
        Relation {
            id: "live".into(),
            name: "live".into(),
            from: Side {
                conn: "any".into(),
                db: shop.into(),
                coll: "{tenant}_orders".into(),
            },
            to: Side {
                conn: "cluster".into(),
                db: logistics.into(),
                coll: to_coll.into(),
            },
            rules,
            rule_notes: Vec::new(),
            scope: vec![ScopeFilter {
                to: "store".into(),
                value: "{tenant}".into(),
            }],
            from_name: "shipments".into(),
            to_name: "order".into(),
            pairs: HashMap::new(),
            draft: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    pub(crate) fn shipments_relation(shop: &str, logistics: &str) -> Relation {
        relation(
            shop,
            logistics,
            "shipments",
            vec![vec![
                cond("customerId", Op::Eq, "customerId"),
                cond("key", Op::Prefix, "orderRef"),
            ]],
        )
    }

    pub(crate) fn parcels_relation(shop: &str, logistics: &str) -> Relation {
        relation(
            shop,
            logistics,
            "parcels",
            vec![
                vec![
                    cond("customerId", Op::Eq, "key"),
                    cond("key", Op::Eq, "secondaryKey"),
                ],
                vec![cond("{customerId}-{key}", Op::Eq, "externalId")],
            ],
        )
    }

    /// Fresh fixture databases: (shop, logistics).
    pub(crate) async fn fixtures(client: &Client) -> (String, String) {
        let run = uuid::Uuid::new_v4().simple().to_string();
        let shop = format!("studio_rel_shop_{}", &run[..8]);
        let logistics = format!("studio_rel_logistics_{}", &run[..8]);
        let c = client.database(&shop);
        c.collection::<Document>("berlin_orders")
            .insert_many([
                doc! { "_id": 1, "customerId": uuid(CUSTOMER), "key": uuid(K1), "text": "hi" },
                doc! { "_id": 2, "customerId": uuid(CUSTOMER), "key": uuid(K2), "text": "old" },
                doc! { "_id": 3, "customerId": uuid(OTHER_CUSTOMER), "key": uuid(K3), "text": "none" },
                doc! { "_id": 4, "customerId": uuid(CUSTOMER), "key": uuid(K4), "text": "berlin k4" },
            ])
            .await
            .unwrap();
        c.collection::<Document>("acme_orders")
            .insert_many([
                doc! { "_id": 1, "customerId": uuid(CUSTOMER), "key": uuid(K4), "text": "acme k4" },
            ])
            .await
            .unwrap();
        let d = client.database(&logistics);
        d.collection::<Document>("shipments")
            .insert_many([
                doc! { "_id": 1, "store": "berlin", "customerId": CUSTOMER, "orderRef": K1, "status": "DELIVERED", "weight": 2 },
                doc! { "_id": 2, "store": "berlin", "customerId": CUSTOMER, "orderRef": K1, "status": "RETURNED", "weight": 2 },
                doc! { "_id": 3, "store": "berlin", "customerId": CUSTOMER, "orderRef": format!("{K1}-split"), "status": "DELIVERED", "weight": 1.5 },
                doc! { "_id": 4, "store": "acme", "customerId": CUSTOMER, "orderRef": K4, "status": "DELIVERED", "weight": 7 },
                doc! { "_id": 5, "store": "berlin", "customerId": CUSTOMER, "orderRef": K2, "status": "DELIVERED", "weight": 1 },
                // Another tenant's shipment with the same ids: the scope keeps it out.
                doc! { "_id": 6, "store": "acme", "customerId": CUSTOMER, "orderRef": K1, "status": "DELIVERED", "weight": 100 },
            ])
            .await
            .unwrap();
        d.collection::<Document>("parcels")
            .insert_many([
                doc! { "_id": 1, "store": "berlin", "key": CUSTOMER, "secondaryKey": K1, "quantity": 3 },
                doc! { "_id": 2, "store": "berlin", "externalId": format!("{CUSTOMER}-{K2}"), "quantity": 5 },
            ])
            .await
            .unwrap();
        (shop, logistics)
    }

    pub(crate) async fn drop_fixtures(client: &Client, shop: &str, logistics: &str) {
        client.database(shop).drop().await.unwrap();
        client.database(logistics).drop().await.unwrap();
    }

    async fn orders(client: &Client, db: &str, coll: &str) -> Vec<Document> {
        client
            .database(db)
            .collection::<Document>(coll)
            .find(doc! {})
            .sort(doc! { "_id": 1 })
            .await
            .unwrap()
            .try_collect()
            .await
            .unwrap()
    }

    fn agg(
        id: &str,
        kind: AggregateKind,
        field: Option<&str>,
        w: Option<(&str, Value)>,
    ) -> Aggregate {
        Aggregate {
            id: id.into(),
            kind,
            field: field.map(str::to_string),
            where_field: w.as_ref().map(|(f, _)| f.to_string()),
            where_value: w.map(|(_, v)| v),
        }
    }

    fn ids(found: &Found) -> Vec<i64> {
        found
            .docs
            .iter()
            .map(|d| d["_id"].as_i64().unwrap())
            .collect()
    }

    async fn checks(shop_client: &Client, logistics_client: &Client, shop: &str, logistics: &str) {
        let src = |db: &str, coll: &str| Source {
            connection_id: "c".into(),
            database: db.into(),
            collection: coll.into(),
        };

        // From -> To: berlin orders to their shipments, UUID Binary -> text,
        // scope by tenant, "starts with" for the suffixed orderRef.
        let shipments = shipments_relation(shop, logistics);
        let berlin = orders(shop_client, shop, "berlin_orders").await;
        let aggregates = [
            agg("n", AggregateKind::Count, None, None),
            agg(
                "delivered",
                AggregateKind::Count,
                None,
                Some(("status", json!("DELIVERED"))),
            ),
            agg(
                "weight",
                AggregateKind::Sum,
                Some("weight"),
                Some(("status", json!("DELIVERED"))),
            ),
            agg("any", AggregateKind::Exists, None, None),
            agg("status", AggregateKind::First, Some("status"), None),
        ];
        let out = find_related(
            logistics_client,
            &shipments,
            Dir::From,
            &src(shop, "berlin_orders"),
            &berlin,
            &aggregates,
            5,
        )
        .await
        .unwrap();
        assert_eq!(out.target_database, logistics);
        assert_eq!(out.target_collection, "shipments");
        assert!(!out.truncated);
        let r = &out.results;
        assert_eq!(ids(&r[0]), vec![1, 2, 3], "{r:?}");
        assert_eq!(r[0].rule, Some(0));
        assert_eq!(r[0].aggregates["n"], json!(3));
        assert_eq!(r[0].aggregates["delivered"], json!(2));
        assert_eq!(r[0].aggregates["weight"], json!(3.5));
        assert_eq!(r[0].aggregates["any"], json!(true));
        assert_eq!(r[0].aggregates["status"], json!("DELIVERED"));
        assert_eq!(ids(&r[1]), vec![5]);
        assert_eq!(r[2].count, 0);
        assert_eq!(r[2].rule, None);
        assert_eq!(r[2].aggregates["any"], json!(false));
        assert_eq!(r[2].aggregates["weight"], json!(0));
        assert_eq!(r[2].aggregates["status"], Value::Null);
        // berlin's K4 order: acme has a shipment for K4, the scope keeps it out.
        assert_eq!(r[3].count, 0);
        assert_eq!(out.matched, 4);

        // The other tenant's collection reads its own shipments.
        let acme = orders(shop_client, shop, "acme_orders").await;
        let out = find_related(
            logistics_client,
            &shipments,
            Dir::From,
            &src(shop, "acme_orders"),
            &acme,
            &[],
            5,
        )
        .await
        .unwrap();
        assert_eq!(ids(&out.results[0]), vec![4]);

        // To -> From: shipments back to their order, the collection picked from
        // store; the suffixed orderRef finds its order too.
        let all_shipments = orders(logistics_client, logistics, "shipments").await;
        let out = find_related(
            shop_client,
            &shipments,
            Dir::To,
            &src(logistics, "shipments"),
            &all_shipments,
            &[agg("text", AggregateKind::First, Some("text"), None)],
            5,
        )
        .await
        .unwrap();
        assert_eq!(out.target_database, shop);
        assert_eq!(out.target_collection, "berlin_orders, acme_orders");
        let texts: Vec<Value> = out
            .results
            .iter()
            .map(|f| f.aggregates["text"].clone())
            .collect();
        assert_eq!(
            texts,
            vec![
                json!("hi"),
                json!("hi"),
                json!("hi"),
                json!("acme k4"),
                json!("old"),
                // acme has no K1 order.
                Value::Null,
            ]
        );
        assert!(out.results.iter().take(5).all(|f| f.count == 1));

        // Rule 2: the template, both ways.
        let prov = parcels_relation(shop, logistics);
        let out = find_related(
            logistics_client,
            &prov,
            Dir::From,
            &src(shop, "berlin_orders"),
            &berlin,
            &[agg("exp", AggregateKind::Sum, Some("quantity"), None)],
            5,
        )
        .await
        .unwrap();
        let r = &out.results;
        assert_eq!((ids(&r[0]), r[0].rule), (vec![1], Some(0)));
        assert_eq!((ids(&r[1]), r[1].rule), (vec![2], Some(1)));
        assert_eq!(r[1].aggregates["exp"], json!(5));
        assert_eq!(r[2].count, 0);
        let rows = orders(logistics_client, logistics, "parcels").await;
        let out = find_related(
            shop_client,
            &prov,
            Dir::To,
            &src(logistics, "parcels"),
            &rows,
            &[],
            5,
        )
        .await
        .unwrap();
        assert_eq!(out.target_collection, "berlin_orders");
        assert_eq!(
            (ids(&out.results[0]), out.results[0].rule),
            (vec![1], Some(0))
        );
        assert_eq!(
            (ids(&out.results[1]), out.results[1].rule),
            (vec![2], Some(1))
        );
    }

    #[tokio::test]
    #[ignore]
    async fn live_find_related_across_databases_and_clients() {
        let shop_client = Client::with_uri_str(uri()).await.unwrap();
        let logistics_client = Client::with_uri_str(uri()).await.unwrap();
        let (shop, logistics) = fixtures(&shop_client).await;
        let outcome = tokio::spawn({
            let (a, b, shop, logistics) = (
                shop_client.clone(),
                logistics_client.clone(),
                shop.clone(),
                logistics.clone(),
            );
            async move { checks(&a, &b, &shop, &logistics).await }
        })
        .await;
        drop_fixtures(&shop_client, &shop, &logistics).await;
        if let Err(e) = outcome {
            std::panic::resume_unwind(e.into_panic());
        }
    }

    #[tokio::test]
    #[ignore]
    async fn live_the_cap_marks_the_page_truncated() {
        let client = Client::with_uri_str(uri()).await.unwrap();
        let run = uuid::Uuid::new_v4().simple().to_string();
        let (shop, logistics) = (
            format!("studio_rel_shop_{}", &run[..8]),
            format!("studio_rel_logistics_{}", &run[..8]),
        );
        let shipments: Vec<Document> = (0..MATCH_CAP + 20)
            .map(|i| doc! { "_id": i, "store": "berlin", "customerId": CUSTOMER, "orderRef": K1 })
            .collect();
        client
            .database(&logistics)
            .collection::<Document>("shipments")
            .insert_many(shipments)
            .await
            .unwrap();
        let relation = shipments_relation(&shop, &logistics);
        let order = doc! { "customerId": uuid(CUSTOMER), "key": uuid(K1) };
        let out = find_related(
            &client,
            &relation,
            Dir::From,
            &Source {
                connection_id: "c".into(),
                database: shop.clone(),
                collection: "berlin_orders".into(),
            },
            &[order],
            &[agg("n", AggregateKind::Count, None, None)],
            3,
        )
        .await;
        drop_fixtures(&client, &shop, &logistics).await;
        let out = out.unwrap();
        assert!(out.truncated);
        assert_eq!(out.matched, MATCH_CAP as u64);
        assert_eq!(out.results[0].aggregates["n"], json!(MATCH_CAP));
        assert_eq!(out.results[0].docs.len(), 3);
        // Sorted by _id: the first ones.
        assert_eq!(out.results[0].docs[0]["_id"], json!(0));
    }
}
