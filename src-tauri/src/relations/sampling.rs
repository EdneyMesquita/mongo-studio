//! Link suggestions and the relation check: small fixed samples, capped
//! work, time limits, and only id-shaped fields - they run against
//! production databases.
//!
//! What one call reads at most:
//! - a suggestion: one names-only listCollections per `{tenant}` side, 50
//!   sampled From and 50 sampled To documents, then up to 40 "equals" probes
//!   and 8 "starts with" probes of at most 50 documents each, projected on
//!   the probed field;
//! - a check: one names-only listCollections per `{tenant}` side, 200
//!   sampled From documents in at most 5 collections, the engine on each of
//!   them (capped at `engine::MATCH_CAP` documents per call), `list_indexes`
//!   on at most 5 target collections, and 200 sampled To documents back,
//!   in at most 5 tenants.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use bson::spec::BinarySubtype;
use bson::{doc, Bson, Document, Regex};
use futures_util::TryStreamExt;
use mongodb::Client;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::bridge::{canonical, collection_for, convert, tenant_of, values_at};
use super::engine::{self, FindRelatedOutput, Source};
use super::model::{Bridge, Dir, Op, Relation};

/// Where a side is read from for a suggestion or a check.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleSide {
    pub database: String,
    /// A collection name or a `{tenant}` pattern; a pattern samples a few
    /// matching collections picked at random.
    pub collection: String,
}

/// A candidate link between a From field and a To field.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub from: String,
    pub to: String,
    pub op: Op,
    #[serde(rename = "as")]
    pub bridge: Bridge,
    /// Sampled From values found on the To side.
    pub matched: u32,
    pub sampled: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Ok,
    Warn,
    Info,
}

/// One line of the check, e.g. "Sampled 200 orders in 5 tenants: rule 1 matched 179 · ...".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckLine {
    pub kind: LineKind,
    pub text: String,
    /// For a missing index: the collection and keys a "Create index…" script would use.
    pub index: Option<IndexHint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexHint {
    pub database: String,
    pub collection: String,
    /// Field -> 1, in order.
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
    pub lines: Vec<CheckLine>,
    /// Per rule: sampled From documents it found something for (after the earlier rules).
    pub rule_matches: Vec<u32>,
    pub sampled: u32,
    pub none: u32,
}

/// Collections of a `{tenant}` pattern opened by one side of a call.
const PICK: usize = 5;
const SUGGEST_SAMPLE: usize = 50;
const CHECK_SAMPLE: usize = 200;
const SAMPLE_TIME: Duration = Duration::from_secs(5);
/// Paths are read this deep (`a`, `a.b`).
const MAX_DEPTH: usize = 2;
/// Distinct values kept per sampled From path.
const MAX_VALUES: usize = 50;
/// "Equals" probes per suggestion, and the extra "starts with" ones.
const MAX_PAIRS: usize = 40;
const MAX_PREFIX_PROBES: usize = 8;
const PROBE_LIMIT: i64 = 50;
const PROBE_TIME: Duration = Duration::from_millis(1500);
const MIN_RATE: f64 = 0.3;
const MAX_SUGGESTIONS: usize = 8;
/// Integer fields need this many distinct sampled values (`status: 1` isn't an id).
const MIN_DISTINCT_INTS: usize = 5;

// ---------------------------------------------------------------------------
// Collections and samples
// ---------------------------------------------------------------------------

/// The collections a side reads: the name itself, or the `PICK` busiest of
/// `CANDIDATES` names matching its `{tenant}` pattern picked at random.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Picked {
    collections: Vec<String>,
    /// How many collections match the pattern (1 without a pattern).
    total: usize,
    pattern: bool,
}

/// Escapes a literal for a server-side (PCRE) regular expression.
fn escape_regex(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if "\\^$.|?*+()[]{}/".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// The listCollections name filter of a `{tenant}` pattern, None without one.
/// Accepts exactly the names `bridge::tenant_of` gives a tenant for.
fn pattern_regex(pattern: &str) -> Option<String> {
    let at = pattern.find("{tenant}")?;
    let before = &pattern[..at];
    let after = &pattern[at + "{tenant}".len()..];
    Some(format!(
        "^{}.+{}$",
        escape_regex(before),
        escape_regex(after)
    ))
}

/// Up to `n` of `names`, at random, sorted for stable output.
fn pick_random(mut names: Vec<String>, n: usize) -> Vec<String> {
    names.shuffle(&mut rand::rng());
    names.truncate(n);
    names.sort();
    names
}

async fn pick_collections(client: &Client, db: &str, coll: &str) -> AppResult<Picked> {
    let Some(regex) = pattern_regex(coll) else {
        return Ok(Picked {
            collections: vec![coll.to_string()],
            total: 1,
            pattern: false,
        });
    };
    let names: Vec<String> = client
        .database(db)
        .list_collection_names()
        .filter(doc! { "name": { "$regex": regex } })
        .authorized_collections(true)
        .await?
        .into_iter()
        .filter(|name| tenant_of(coll, name).is_some())
        .collect();
    let total = names.len();
    Ok(Picked {
        collections: pick_busiest(client, db, pick_random(names, CANDIDATES)).await,
        total,
        pattern: true,
    })
}

/// Tenants drawn before keeping the busiest `PICK`: most tenants of a big
/// cluster hold a handful of documents, and a sample of those says little.
const CANDIDATES: usize = 20;

/// The `PICK` of `names` holding the most documents, by the estimated count
/// (collection metadata, no scan); empty ones last. Sorted for stable output.
/// One round trip per name: a few ms each, at worst `SAMPLE_TIME` each on a
/// stalled server, where a count that fails counts as empty.
async fn pick_busiest(client: &Client, db: &str, names: Vec<String>) -> Vec<String> {
    let database = client.database(db);
    let mut counted = Vec::with_capacity(names.len());
    for name in names {
        let n = database
            .collection::<Document>(&name)
            .estimated_document_count()
            .max_time(SAMPLE_TIME)
            .await
            .unwrap_or(0);
        counted.push((n, name));
    }
    counted.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let mut picked: Vec<String> = counted
        .into_iter()
        .take(PICK)
        .map(|(_, name)| name)
        .collect();
    picked.sort();
    picked
}

/// `total` split over `parts` as evenly as possible, summing to `total`.
fn split(total: usize, parts: usize) -> Vec<usize> {
    if parts == 0 {
        return Vec::new();
    }
    (0..parts)
        .map(|i| total / parts + usize::from(i < total % parts))
        .collect()
}

async fn sample(
    client: &Client,
    db: &str,
    coll: &str,
    pre: Option<Document>,
    size: usize,
) -> AppResult<Vec<Document>> {
    if size == 0 {
        return Ok(Vec::new());
    }
    let mut pipeline = Vec::new();
    if let Some(filter) = pre {
        pipeline.push(doc! { "$match": filter });
    }
    pipeline.push(doc! { "$sample": { "size": size as i64 } });
    let docs = client
        .database(db)
        .collection::<Document>(coll)
        .aggregate(pipeline)
        .max_time(SAMPLE_TIME)
        .await?
        .try_collect()
        .await?;
    Ok(docs)
}

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

/// What a value looks like, for telling ids apart and picking a bridge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Kind {
    /// Binary subtype 4.
    Uuid,
    /// Binary subtype 3 (.NET GUID).
    Guid,
    Oid,
    /// Dashed UUID text.
    UuidText,
    /// 24-char hex text.
    OidText,
    /// Other id-like text of 16+ chars: hex, ULID, long digit runs.
    IdText,
    /// Text starting with a dashed UUID and carrying more (`<uuid>-ref`).
    UuidPrefixed,
    /// Short decimal digits.
    DigitsText,
    Int,
    /// Any other text.
    Text,
}

impl Kind {
    /// Whether a From value of this kind is worth linking from.
    fn is_id(self) -> bool {
        matches!(
            self,
            Kind::Uuid
                | Kind::Guid
                | Kind::Oid
                | Kind::UuidText
                | Kind::OidText
                | Kind::IdText
                | Kind::Int
        )
    }
}

fn is_uuid_text(s: &str) -> bool {
    s.len() == 36
        && s.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_ulid(s: &str) -> bool {
    s.len() == 26
        && s.chars()
            .all(|c| c.is_ascii_digit() || (c.is_ascii_uppercase() && !"ILOU".contains(c)))
}

fn text_kind(s: &str) -> Kind {
    if is_uuid_text(s) {
        Kind::UuidText
    } else if s.len() > 36 && s.is_char_boundary(36) && is_uuid_text(&s[..36]) {
        Kind::UuidPrefixed
    } else if s.len() == 24 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        Kind::OidText
    } else if s.len() >= 16 && (s.chars().all(|c| c.is_ascii_hexdigit()) || is_ulid(s)) {
        Kind::IdText
    } else if !s.is_empty() && s.len() <= 18 && s.chars().all(|c| c.is_ascii_digit()) {
        Kind::DigitsText
    } else {
        Kind::Text
    }
}

fn kind_of(value: &Bson) -> Option<Kind> {
    match value {
        Bson::Binary(bin) if bin.bytes.len() == 16 => match bin.subtype {
            BinarySubtype::Uuid => Some(Kind::Uuid),
            BinarySubtype::UuidOld => Some(Kind::Guid),
            _ => None,
        },
        Bson::ObjectId(_) => Some(Kind::Oid),
        Bson::Int32(_) | Bson::Int64(_) => Some(Kind::Int),
        Bson::String(s) => Some(text_kind(s)),
        _ => None,
    }
}

/// Every path in a document up to `MAX_DEPTH`, in document order; arrays of
/// documents are looked through (`items.id`).
fn paths_of(doc: &Document, out: &mut Vec<String>) {
    fn walk(doc: &Document, prefix: &str, depth: usize, out: &mut Vec<String>) {
        for (key, value) in doc {
            let path = if prefix.is_empty() {
                key.clone()
            } else {
                format!("{prefix}.{key}")
            };
            let nested: Vec<&Document> = match value {
                Bson::Document(d) => vec![d],
                Bson::Array(items) => items.iter().filter_map(Bson::as_document).collect(),
                _ => Vec::new(),
            };
            if nested.is_empty() {
                if !out.contains(&path) {
                    out.push(path);
                }
            } else if depth < MAX_DEPTH {
                for d in nested {
                    walk(d, &path, depth + 1, out);
                }
            }
        }
    }
    walk(doc, "", 1, out);
}

/// A sampled From path whose values look like ids.
#[derive(Debug, Clone)]
struct FromField {
    path: String,
    kind: Kind,
    /// Distinct values of that kind, at most `MAX_VALUES`.
    values: Vec<Bson>,
}

/// A sampled To path and how many of its values have each shape.
#[derive(Debug, Clone)]
struct ToField {
    path: String,
    kinds: HashMap<Kind, usize>,
    total: usize,
}

impl ToField {
    fn count(&self, kind: Kind) -> usize {
        self.kinds.get(&kind).copied().unwrap_or(0)
    }
}

fn from_fields(docs: &[Document]) -> Vec<FromField> {
    let mut paths = Vec::new();
    for d in docs {
        paths_of(d, &mut paths);
    }
    let mut out = Vec::new();
    for path in paths {
        let all: Vec<Bson> = docs.iter().flat_map(|d| values_at(d, &path)).collect();
        let mut counts: HashMap<Kind, usize> = HashMap::new();
        for v in &all {
            if let Some(k) = kind_of(v).filter(|k| k.is_id()) {
                *counts.entry(k).or_default() += 1;
            }
        }
        let Some((&kind, &n)) = counts.iter().max_by_key(|(k, n)| (**n, kind_rank(**k))) else {
            continue;
        };
        // Mostly ids: a field holding ids now and then isn't a link.
        if n * 2 < all.len() {
            continue;
        }
        let mut seen = HashSet::new();
        let values: Vec<Bson> = all
            .into_iter()
            .filter(|v| kind_of(v) == Some(kind))
            .filter(|v| canonical(v).is_some_and(|c| seen.insert(c)))
            .take(MAX_VALUES)
            .collect();
        let enough = if kind == Kind::Int {
            MIN_DISTINCT_INTS
        } else {
            2
        };
        if values.len() >= enough {
            out.push(FromField { path, kind, values });
        }
    }
    out
}

/// Breaks ties between kinds deterministically (stronger id shapes first).
fn kind_rank(kind: Kind) -> u8 {
    match kind {
        Kind::Uuid | Kind::Guid => 6,
        Kind::Oid => 5,
        Kind::UuidText => 4,
        Kind::OidText => 3,
        Kind::IdText => 2,
        Kind::Int => 1,
        _ => 0,
    }
}

fn to_fields(docs: &[Document]) -> Vec<ToField> {
    let mut paths = Vec::new();
    for d in docs {
        paths_of(d, &mut paths);
    }
    paths
        .into_iter()
        .filter_map(|path| {
            let mut kinds: HashMap<Kind, usize> = HashMap::new();
            let mut total = 0;
            for d in docs {
                for v in values_at(d, &path) {
                    if let Some(k) = kind_of(&v) {
                        *kinds.entry(k).or_default() += 1;
                        total += 1;
                    }
                }
            }
            (total > 0).then_some(ToField { path, kinds, total })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------

/// The To shapes a From shape can equal, with the bridge that gets there.
fn eq_targets(from: Kind) -> &'static [(Kind, Bridge)] {
    match from {
        Kind::Uuid => &[
            (Kind::Uuid, Bridge::AsStored),
            (Kind::UuidText, Bridge::UuidString),
        ],
        Kind::Guid => &[
            (Kind::Guid, Bridge::AsStored),
            (Kind::UuidText, Bridge::GuidString),
        ],
        Kind::UuidText => &[
            (Kind::UuidText, Bridge::AsStored),
            (Kind::Uuid, Bridge::UuidString),
            (Kind::Guid, Bridge::GuidString),
        ],
        Kind::Oid => &[
            (Kind::Oid, Bridge::AsStored),
            (Kind::OidText, Bridge::OidString),
        ],
        Kind::OidText => &[
            (Kind::OidText, Bridge::AsStored),
            (Kind::Oid, Bridge::OidString),
        ],
        Kind::IdText => &[(Kind::IdText, Bridge::AsStored)],
        Kind::Int => &[
            (Kind::Int, Bridge::AsStored),
            (Kind::DigitsText, Bridge::NumberString),
        ],
        _ => &[],
    }
}

/// The bridge that turns a From shape into UUID text for "starts with".
fn prefix_bridge(from: Kind) -> Option<Bridge> {
    match from {
        Kind::Uuid => Some(Bridge::UuidString),
        Kind::Guid => Some(Bridge::GuidString),
        Kind::UuidText => Some(Bridge::AsStored),
        _ => None,
    }
}

/// A (From, To) pair worth probing.
#[derive(Debug, Clone)]
struct Pair {
    from: usize,
    to: usize,
    /// The "equals" bridge, when the To side holds a compatible shape.
    eq: Option<Bridge>,
    /// The "starts with" bridge, when the To side holds UUID-prefixed text.
    prefix: Option<Bridge>,
    score: u32,
}

fn last_segment(path: &str) -> String {
    path.rsplit('.').next().unwrap_or(path).to_lowercase()
}

/// How much two field names suggest a link.
fn name_affinity(from: &str, to: &str) -> u32 {
    let (a, b) = (last_segment(from), last_segment(to));
    if a == b {
        100
    } else if a.len() >= 2 && b.len() >= 2 && (a.contains(&b) || b.contains(&a)) {
        50
    } else if ["id", "key"].iter().any(|s| b.ends_with(s)) {
        10
    } else {
        0
    }
}

/// The compatible pairs, best guesses first, at most `MAX_PAIRS`. Pairs
/// whose To field never holds the shape the From values would take are
/// dropped before they cost a query.
fn candidate_pairs(from: &[FromField], to: &[ToField]) -> Vec<Pair> {
    let mut pairs = Vec::new();
    for (fi, f) in from.iter().enumerate() {
        for (ti, t) in to.iter().enumerate() {
            let eq = eq_targets(f.kind)
                .iter()
                .filter(|(k, _)| t.count(*k) > 0)
                .max_by_key(|(k, _)| t.count(*k))
                .map(|(k, b)| (*b, t.count(*k)));
            let prefix = prefix_bridge(f.kind)
                .filter(|_| t.count(Kind::UuidPrefixed) > 0)
                .map(|b| (b, t.count(Kind::UuidPrefixed) + t.count(Kind::UuidText)));
            if eq.is_none() && prefix.is_none() {
                continue;
            }
            let shaped = eq.map_or(0, |e| e.1).max(prefix.map_or(0, |p| p.1));
            let score = name_affinity(&f.path, &t.path) + (shaped * 20 / t.total.max(1)) as u32;
            pairs.push(Pair {
                from: fi,
                to: ti,
                eq: eq.map(|e| e.0),
                prefix: prefix.map(|p| p.0),
                score,
            });
        }
    }
    // stable: equal scores keep document order
    pairs.sort_by_key(|p| std::cmp::Reverse(p.score));
    pairs.truncate(MAX_PAIRS);
    pairs
}

/// Sampled From values found among the To values read back ("equals").
fn count_eq(values: &[Bson], bridge: Bridge, found: &HashSet<String>) -> u32 {
    values
        .iter()
        .filter(|v| canonical(&convert(v, bridge)).is_some_and(|c| found.contains(&c)))
        .count() as u32
}

/// Sampled From values some To text read back starts with.
fn count_prefix(prefixes: &[String], found: &HashSet<String>) -> u32 {
    prefixes
        .iter()
        .filter(|p| found.iter().any(|f| f.starts_with(p.as_str())))
        .count() as u32
}

fn rate(matched: u32, sampled: u32) -> f64 {
    if sampled == 0 {
        0.0
    } else {
        f64::from(matched) / f64::from(sampled)
    }
}

/// The suggestions worth showing: rate >= `MIN_RATE`, best first, one per
/// field pair, at most `MAX_SUGGESTIONS`.
fn rank(mut found: Vec<Suggestion>) -> Vec<Suggestion> {
    found.retain(|s| s.sampled > 0 && rate(s.matched, s.sampled) >= MIN_RATE);
    found.sort_by(|a, b| {
        rate(b.matched, b.sampled)
            .total_cmp(&rate(a.matched, a.sampled))
            .then(b.matched.cmp(&a.matched))
            // as many found: "starts with" also links the suffixed values
            .then((b.op == Op::Prefix).cmp(&(a.op == Op::Prefix)))
    });
    let mut seen = HashSet::new();
    found.retain(|s| seen.insert((s.from.clone(), s.to.clone())));
    found.truncate(MAX_SUGGESTIONS);
    found
}

/// `^<escaped text>`, a "starts with" an index can serve.
fn anchored(text: &str) -> Option<Regex> {
    Some(Regex {
        pattern: format!("^{}", escape_regex(text)).try_into().ok()?,
        options: String::new().try_into().ok()?,
    })
}

/// The canonical texts at `path` in the probe's results.
async fn probe(
    client: &Client,
    db: &str,
    coll: &str,
    path: &str,
    condition: Bson,
) -> AppResult<HashSet<String>> {
    let projection = if path == "_id" {
        doc! { "_id": 1 }
    } else {
        doc! { path: 1, "_id": 0 }
    };
    let docs: Vec<Document> = client
        .database(db)
        .collection::<Document>(coll)
        .find(doc! { path: { "$in": condition } })
        .projection(projection)
        .limit(PROBE_LIMIT)
        .max_time(PROBE_TIME)
        .await?
        .try_collect()
        .await?;
    Ok(docs
        .iter()
        .flat_map(|d| values_at(d, path))
        .filter_map(|v| canonical(&v))
        .collect())
}

/// Candidate links between two collections, best first.
pub async fn suggest_links(
    from: &Client,
    from_side: &SampleSide,
    to: &Client,
    to_side: &SampleSide,
) -> AppResult<Vec<Suggestion>> {
    let from_picked = pick_collections(from, &from_side.database, &from_side.collection).await?;
    let to_pattern = pattern_regex(&to_side.collection).is_some();
    // A `{tenant}` To side is read in one collection, so each pair costs one
    // probe: the first sampled From tenant's, or one picked at random.
    let (from_colls, to_coll) = if to_pattern {
        let tenant = from_picked
            .collections
            .iter()
            .find_map(|c| tenant_of(&from_side.collection, c))
            .filter(|t| !t.is_empty() && from_picked.pattern);
        match tenant {
            Some(t) => (
                from_picked.collections[..1].to_vec(),
                collection_for(&to_side.collection, &t),
            ),
            None => {
                let picked = pick_collections(to, &to_side.database, &to_side.collection).await?;
                let Some(first) = picked.collections.into_iter().next() else {
                    return Err(AppError::NotFound(format!(
                        "no collection in {} matches {}",
                        to_side.database, to_side.collection
                    )));
                };
                (from_picked.collections.clone(), first)
            }
        }
    } else {
        (from_picked.collections.clone(), to_side.collection.clone())
    };
    if from_colls.is_empty() {
        return Err(AppError::NotFound(format!(
            "no collection in {} matches {}",
            from_side.database, from_side.collection
        )));
    }

    let mut from_docs = Vec::new();
    let mut last_error = None;
    for (coll, size) in from_colls
        .iter()
        .zip(split(SUGGEST_SAMPLE, from_colls.len()))
    {
        match sample(from, &from_side.database, coll, None, size).await {
            Ok(docs) => from_docs.extend(docs),
            Err(e) => last_error = Some(e),
        }
    }
    if from_docs.is_empty() {
        if let Some(e) = last_error {
            return Err(e);
        }
        return Ok(Vec::new());
    }
    let to_docs = sample(to, &to_side.database, &to_coll, None, SUGGEST_SAMPLE).await?;

    let from_fields = from_fields(&from_docs);
    let to_fields = to_fields(&to_docs);
    let pairs = candidate_pairs(&from_fields, &to_fields);

    let mut found = Vec::new();
    let mut prefix_probes = 0;
    for pair in pairs {
        let f = &from_fields[pair.from];
        let t = &to_fields[pair.to];
        let sampled = f.values.len() as u32;
        if let Some(bridge) = pair.eq {
            let converted: Vec<Bson> = f.values.iter().map(|v| convert(v, bridge)).collect();
            if let Ok(texts) = probe(
                to,
                &to_side.database,
                &to_coll,
                &t.path,
                Bson::Array(converted),
            )
            .await
            {
                let matched = count_eq(&f.values, bridge, &texts);
                found.push(Suggestion {
                    from: f.path.clone(),
                    to: t.path.clone(),
                    op: Op::Eq,
                    bridge,
                    matched,
                    sampled,
                });
            }
        }
        // "starts with" when equals finds too little, and also whenever the
        // To side holds UUIDs with a suffix ("<uuid>-split"): equals finds
        // the plain ones and silently misses those.
        if let Some(bridge) = pair.prefix {
            if prefix_probes >= MAX_PREFIX_PROBES {
                continue;
            }
            prefix_probes += 1;
            let prefixes: Vec<String> = f
                .values
                .iter()
                .filter_map(|v| match convert(v, bridge) {
                    Bson::String(s) => Some(s),
                    _ => None,
                })
                .collect();
            let regexes: Vec<Bson> = prefixes
                .iter()
                .filter_map(|p| anchored(p).map(Bson::RegularExpression))
                .collect();
            if let Ok(texts) = probe(
                to,
                &to_side.database,
                &to_coll,
                &t.path,
                Bson::Array(regexes),
            )
            .await
            {
                found.push(Suggestion {
                    from: f.path.clone(),
                    to: t.path.clone(),
                    op: Op::Prefix,
                    bridge,
                    matched: count_prefix(&prefixes, &texts),
                    sampled,
                });
            }
        }
    }
    Ok(rank(found))
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

fn thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn count_of(n: usize, one: &str, many: &str) -> String {
    if n == 1 {
        format!("1 {one}")
    } else {
        format!("{} {many}", thousands(n))
    }
}

/// What From documents are called: the plural of `to_name` ("orders").
fn from_noun(relation: &Relation) -> String {
    let name = relation.to_name.trim();
    if name.is_empty() {
        "documents".to_string()
    } else if name.ends_with('s') {
        name.to_string()
    } else {
        format!("{name}s")
    }
}

/// What To documents are called: `from_name` ("shipments").
fn to_noun(relation: &Relation) -> String {
    let name = relation.from_name.trim();
    if name.is_empty() {
        "documents".to_string()
    } else {
        name.to_string()
    }
}

/// One From document's outcome: the rule that found something and how many.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Outcome {
    rule: Option<usize>,
    count: u64,
}

fn outcomes(output: &FindRelatedOutput) -> impl Iterator<Item = Outcome> + '_ {
    output.results.iter().map(|f| Outcome {
        rule: f.rule.filter(|_| f.count > 0),
        count: f.count,
    })
}

/// Per rule matches and the documents nothing found.
fn tally(outcomes: &[Outcome], rules: usize) -> (Vec<u32>, u32) {
    let mut per_rule = vec![0u32; rules];
    let mut none = 0;
    for o in outcomes {
        match o.rule.filter(|_| o.count > 0) {
            Some(r) if r < rules => per_rule[r] += 1,
            Some(_) => {}
            None => none += 1,
        }
    }
    (per_rule, none)
}

/// " (1–3 each, avg 1.4)" over the documents that found something.
fn cardinality(outcomes: &[Outcome]) -> String {
    let counts: Vec<u64> = outcomes
        .iter()
        .filter(|o| o.rule.is_some())
        .map(|o| o.count)
        .collect();
    let (Some(min), Some(max)) = (counts.iter().min(), counts.iter().max()) else {
        return String::new();
    };
    let avg = counts.iter().sum::<u64>() as f64 / counts.len() as f64;
    if min == max {
        format!(" ({min} each)")
    } else {
        format!(" ({min}–{max} each, avg {avg:.1})")
    }
}

/// "in the 5 busiest of 20 tenants picked at random (of 10,570)" for a
/// pattern, "" otherwise.
fn tenants_phrase(picked: &Picked) -> String {
    if !picked.pattern {
        return String::new();
    }
    let n = picked.collections.len();
    let drawn = picked.total.min(CANDIDATES);
    if drawn <= n {
        return format!(
            " in {} (of {})",
            count_of(n, "tenant", "tenants"),
            thousands(picked.total)
        );
    }
    if drawn == picked.total {
        return format!(" in the {n} busiest of {drawn} tenants");
    }
    format!(
        " in the {n} busiest of {drawn} tenants picked at random (of {})",
        thousands(picked.total)
    )
}

/// The first line: what the sampled From documents found.
fn from_line(relation: &Relation, picked: &Picked, outcomes: &[Outcome]) -> CheckLine {
    let rules = relation.rules.len();
    let (per_rule, none) = tally(outcomes, rules);
    let found: u32 = per_rule.iter().sum();
    let card = cardinality(outcomes);
    let head = format!(
        "Sampled {} {}{}",
        thousands(outcomes.len()),
        from_noun(relation),
        tenants_phrase(picked)
    );
    let body = if outcomes.is_empty() {
        "none to check".to_string()
    } else if rules > 1 {
        let parts: Vec<String> = per_rule
            .iter()
            .enumerate()
            .map(|(i, n)| {
                let more = if i == 0 { "" } else { " more" };
                format!("rule {} matched {}{more}", i + 1, thousands(*n as usize))
            })
            .collect();
        format!(
            "{} · {} have none{card}",
            parts.join(" · "),
            thousands(none as usize)
        )
    } else {
        format!(
            "{} have {}{card} · {} have none",
            thousands(found as usize),
            to_noun(relation),
            thousands(none as usize)
        )
    };
    CheckLine {
        kind: if found > 0 {
            LineKind::Ok
        } else {
            LineKind::Warn
        },
        text: format!("{head}: {body}"),
        index: None,
    }
}

/// The line for the To documents sampled back.
fn back_line(relation: &Relation, tenants: Option<usize>, outcomes: &[Outcome]) -> CheckLine {
    let rules = relation.rules.len();
    let (per_rule, none) = tally(outcomes, rules);
    let found: u32 = per_rule.iter().sum();
    let one = relation.to_name.trim();
    let one = if one.is_empty() { "match" } else { one };
    let mut text = format!(
        "Sampled {} {}{}: {} have a {one} · {} don't",
        thousands(outcomes.len()),
        to_noun(relation),
        tenants.map_or(String::new(), |n| format!(
            " in {}",
            count_of(n, "tenant", "tenants")
        )),
        thousands(found as usize),
        thousands(none as usize)
    );
    if rules > 1 {
        let later: Vec<String> = per_rule
            .iter()
            .enumerate()
            .skip(1)
            .filter(|(_, n)| **n > 0)
            .map(|(i, n)| format!("rule {} found {}", i + 1, thousands(*n as usize)))
            .collect();
        if !later.is_empty() {
            text.push_str(&format!(" ({} of them)", later.join(", ")));
        }
    }
    CheckLine {
        kind: if found > 0 || outcomes.is_empty() {
            LineKind::Ok
        } else {
            LineKind::Warn
        },
        text,
        index: None,
    }
}

fn line(kind: LineKind, text: String) -> CheckLine {
    CheckLine {
        kind,
        text,
        index: None,
    }
}

/// The name of an index usable for an equality on `field`: its keys, in
/// order, reach `field` with only scope fields before it.
fn covering_index<'a>(
    indexes: &'a [(String, Document)],
    scope: &[String],
    field: &str,
) -> Option<&'a str> {
    indexes.iter().find_map(|(name, keys)| {
        for (key, _) in keys {
            if key == field {
                return Some(name.as_str());
            }
            if !scope.iter().any(|s| s == key) {
                return None;
            }
        }
        None
    })
}

/// The index lines: per rule, whether the sampled target collections have
/// an index for its first To field.
fn index_lines(
    relation: &Relation,
    database: &str,
    indexes: &[(String, Vec<(String, Document)>)],
) -> Vec<CheckLine> {
    let scope: Vec<String> = relation.scope.iter().map(|s| s.to.clone()).collect();
    let multi = relation.rules.len() > 1;
    let pattern = pattern_regex(&relation.to.coll).is_some();
    let mut lines = Vec::new();
    if indexes.is_empty() {
        return lines;
    }
    for (i, rule) in relation.rules.iter().enumerate() {
        let Some(first) = rule.first() else { continue };
        let field = first.to.as_str();
        let subject = if multi {
            format!("rule {}", i + 1)
        } else {
            "the relation".to_string()
        };
        let mut names = Vec::new();
        let mut missing = Vec::new();
        for (coll, list) in indexes {
            match covering_index(list, &scope, field) {
                Some(name) => names.push(name.to_string()),
                None => missing.push(coll.clone()),
            }
        }
        if missing.is_empty() {
            let mut unique = names.clone();
            unique.dedup();
            let on = if pattern {
                format!(
                    "the {} sampled {} collections",
                    indexes.len(),
                    relation.to.coll
                )
            } else {
                indexes[0].0.clone()
            };
            let rule_note = if multi {
                format!(" (rule {})", i + 1)
            } else {
                String::new()
            };
            lines.push(line(
                LineKind::Ok,
                format!("Index {} on {on}{rule_note}", unique.join(", ")),
            ));
        } else {
            let mut keys = scope.clone();
            for c in rule {
                if !keys.contains(&c.to) {
                    keys.push(c.to.clone());
                }
            }
            let text = if pattern {
                format!(
                    "No index on {field} in {} of the {} sampled {} collections: {subject} scans them. Fine for a few rows; slow on millions.",
                    missing.len(),
                    indexes.len(),
                    relation.to.coll
                )
            } else {
                format!(
                    "No index on {}.{field}: {subject} scans the collection. Fine for a few rows; slow on millions.",
                    missing[0]
                )
            };
            lines.push(CheckLine {
                kind: LineKind::Warn,
                text,
                index: Some(IndexHint {
                    database: database.to_string(),
                    collection: if pattern {
                        relation.to.coll.clone()
                    } else {
                        missing[0].clone()
                    },
                    keys,
                }),
            });
        }
    }
    lines
}

/// The scope field carrying the tenant on To documents (`store = {tenant}`).
fn tenant_field(relation: &Relation) -> Option<&str> {
    relation
        .scope
        .iter()
        .find(|s| s.value == "{tenant}")
        .map(|s| s.to.as_str())
}

/// To documents grouped by tenant, at most `PICK` tenants: the preferred
/// ones (sampled on the From side) first, then the most frequent.
fn trim_tenants(
    docs: Vec<Document>,
    field: &str,
    preferred: &[String],
) -> Vec<(String, Vec<Document>)> {
    let mut groups: Vec<(String, Vec<Document>)> = Vec::new();
    for d in docs {
        let Some(tenant) = values_at(&d, field).first().and_then(canonical) else {
            continue;
        };
        match groups.iter_mut().find(|(t, _)| *t == tenant) {
            Some((_, list)) => list.push(d),
            None => groups.push((tenant, vec![d])),
        }
    }
    groups.sort_by_key(|(t, list)| {
        (
            std::cmp::Reverse(preferred.contains(t)),
            std::cmp::Reverse(list.len()),
        )
    });
    groups.truncate(PICK);
    groups
}

/// What the check opened, for the tests: (side, collection).
type Opened = Vec<(Dir, String)>;

async fn list_index_keys(
    client: &Client,
    db: &str,
    coll: &str,
) -> AppResult<Vec<(String, Document)>> {
    let models: Vec<_> = client
        .database(db)
        .collection::<Document>(coll)
        .list_indexes()
        .await?
        .try_collect()
        .await?;
    Ok(models
        .into_iter()
        .map(|m| {
            let name = m.options.and_then(|o| o.name).unwrap_or_default();
            (name, m.keys)
        })
        .collect())
}

/// Samples the From side (and the To side back), reports what each rule
/// matches, and checks the live indexes the rules need.
pub async fn check_relation(
    from: &Client,
    to: &Client,
    relation: &Relation,
    from_connection_id: &str,
) -> AppResult<CheckReport> {
    check(from, to, relation, from_connection_id)
        .await
        .map(|(report, _)| report)
}

async fn check(
    from: &Client,
    to: &Client,
    relation: &Relation,
    from_connection_id: &str,
) -> AppResult<(CheckReport, Opened)> {
    if relation.rules.is_empty() {
        return Err(AppError::InvalidInput(
            "the relation has no rules".to_string(),
        ));
    }
    let rules = relation.rules.len();
    let mut opened: Opened = Vec::new();
    let mut lines = Vec::new();
    let mut warnings = Vec::new();
    let mut truncated = false;

    // From -> To
    let picked = pick_collections(from, &relation.from.db, &relation.from.coll).await?;
    if picked.collections.is_empty() {
        return Err(AppError::NotFound(format!(
            "no collection in {} matches {}",
            relation.from.db, relation.from.coll
        )));
    }
    let mut from_outcomes = Vec::new();
    let mut targets: Vec<(String, String)> = Vec::new();
    let sizes = split(CHECK_SAMPLE, picked.collections.len());
    for (coll, size) in picked.collections.iter().zip(sizes) {
        opened.push((Dir::From, coll.clone()));
        let docs = match sample(from, &relation.from.db, coll, None, size).await {
            Ok(docs) => docs,
            Err(e) => {
                warnings.push(line(
                    LineKind::Warn,
                    format!("Couldn't sample {}.{coll}: {e}", relation.from.db),
                ));
                continue;
            }
        };
        if docs.is_empty() {
            continue;
        }
        let source = Source {
            connection_id: from_connection_id.to_string(),
            database: relation.from.db.clone(),
            collection: coll.clone(),
        };
        match engine::find_related(to, relation, Dir::From, &source, &docs, &[], 0).await {
            Ok(output) => {
                truncated |= output.truncated;
                from_outcomes.extend(outcomes(&output));
                let target = (
                    output.target_database.clone(),
                    output.target_collection.clone(),
                );
                if !target.1.is_empty() && !targets.contains(&target) {
                    targets.push(target);
                }
            }
            Err(e) => warnings.push(line(
                LineKind::Warn,
                format!("Couldn't follow the relation from {coll}: {e}"),
            )),
        }
    }
    let (rule_matches, none) = tally(&from_outcomes, rules);
    lines.push(from_line(relation, &picked, &from_outcomes));

    // Indexes on the target collections the sample read.
    let mut indexes = Vec::new();
    for (db, coll) in targets.iter().take(PICK) {
        match list_index_keys(to, db, coll).await {
            Ok(list) => indexes.push((coll.clone(), list)),
            Err(e) => warnings.push(line(
                LineKind::Info,
                format!("Couldn't list the indexes of {db}.{coll}: {e}"),
            )),
        }
    }

    // To -> From, on the same tenants.
    let tenants: Vec<String> = if picked.pattern {
        picked
            .collections
            .iter()
            .filter_map(|c| tenant_of(&relation.from.coll, c))
            .collect()
    } else {
        Vec::new()
    };
    let mut back: Vec<(String, Vec<Document>)> = Vec::new();
    let mut back_tenants = None;
    if pattern_regex(&relation.to.coll).is_some() {
        let colls: Vec<String> = if tenants.is_empty() {
            pick_collections(to, &relation.to.db, &relation.to.coll)
                .await?
                .collections
        } else {
            tenants
                .iter()
                .map(|t| collection_for(&relation.to.coll, t))
                .collect()
        };
        back_tenants = Some(colls.len());
        for (coll, size) in colls.iter().zip(split(CHECK_SAMPLE, colls.len())) {
            match sample(to, &relation.to.db, coll, None, size).await {
                Ok(docs) => back.push((coll.clone(), docs)),
                Err(e) => warnings.push(line(
                    LineKind::Warn,
                    format!("Couldn't sample {}.{coll}: {e}", relation.to.db),
                )),
            }
        }
    } else if picked.pattern {
        // A shared To collection: the tenant comes from a scope field, and
        // only a few tenants are followed so only a few From collections open.
        match tenant_field(relation) {
            None => warnings.push(line(
                LineKind::Info,
                format!(
                    "Didn't sample {} back: no scope filter says which tenant they belong to.",
                    to_noun(relation)
                ),
            )),
            Some(field) => {
                let coll = relation.to.coll.clone();
                // Narrow to the sampled tenants only when an index makes it cheap.
                let indexed = indexes.iter().any(|(c, list)| {
                    *c == coll
                        && list
                            .iter()
                            .any(|(_, keys)| keys.keys().next().is_some_and(|k| k == field))
                });
                let pre = indexed.then(|| doc! { field: { "$in": tenants.clone() } });
                match sample(to, &relation.to.db, &coll, pre, CHECK_SAMPLE).await {
                    Ok(docs) => {
                        let groups = trim_tenants(docs, field, &tenants);
                        back_tenants = Some(groups.len());
                        back.extend(groups.into_iter().map(|(_, docs)| (coll.clone(), docs)));
                    }
                    Err(e) => warnings.push(line(
                        LineKind::Warn,
                        format!("Couldn't sample {}.{coll}: {e}", relation.to.db),
                    )),
                }
            }
        }
    } else {
        let coll = relation.to.coll.clone();
        match sample(to, &relation.to.db, &coll, None, CHECK_SAMPLE).await {
            Ok(docs) => back.push((coll, docs)),
            Err(e) => warnings.push(line(
                LineKind::Warn,
                format!(
                    "Couldn't sample {}.{}: {e}",
                    relation.to.db, relation.to.coll
                ),
            )),
        }
    }
    let mut back_outcomes = Vec::new();
    let mut back_ran = false;
    for (coll, docs) in &back {
        if docs.is_empty() {
            continue;
        }
        // The To documents' connection id isn't known here; the engine
        // reads the From side through `from` either way.
        let source = Source {
            connection_id: from_connection_id.to_string(),
            database: relation.to.db.clone(),
            collection: coll.clone(),
        };
        match engine::find_related(from, relation, Dir::To, &source, docs, &[], 0).await {
            Ok(output) => {
                back_ran = true;
                truncated |= output.truncated;
                back_outcomes.extend(outcomes(&output));
                opened.push((Dir::To, output.target_collection.clone()));
            }
            Err(e) => warnings.push(line(
                LineKind::Warn,
                format!("Couldn't follow the relation back from {coll}: {e}"),
            )),
        }
    }
    if back_ran {
        lines.push(back_line(
            relation,
            back_tenants.filter(|_| picked.pattern),
            &back_outcomes,
        ));
    }

    if truncated {
        lines.push(line(
            LineKind::Info,
            format!(
                "Some samples found more than {} documents; counts may be low.",
                thousands(engine::MATCH_CAP as usize)
            ),
        ));
    }
    lines.extend(index_lines(relation, &relation.to.db, &indexes));
    lines.extend(warnings);

    Ok((
        CheckReport {
            lines,
            rule_matches,
            sampled: from_outcomes.len() as u32,
            none,
        },
        opened,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relations::model::{Condition, ScopeFilter, Side};
    use bson::{oid::ObjectId, Binary};

    const UUID: &str = "eed4b0b7-04c8-4597-b3e7-b394b1192a20";

    fn uuid_bin(text: &str) -> Bson {
        convert(&Bson::String(text.to_string()), Bridge::UuidString)
    }

    fn uuid_n(n: u32) -> String {
        format!("{n:08x}-04c8-4597-b3e7-b394b1192a20")
    }

    fn relation(rules: Vec<Vec<Condition>>, scope: Vec<ScopeFilter>) -> Relation {
        Relation {
            id: "r".into(),
            name: "test".into(),
            from: Side {
                conn: "any".into(),
                db: "shop".into(),
                coll: "{tenant}_orders".into(),
            },
            to: Side {
                conn: "cluster".into(),
                db: "logistics".into(),
                coll: "parcels".into(),
            },
            rules,
            rule_notes: vec![],
            scope,
            from_name: "parcels documents".into(),
            to_name: "order".into(),
            pairs: HashMap::new(),
            draft: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn cond(from: &str, to: &str) -> Condition {
        Condition {
            from: from.into(),
            op: Op::Eq,
            to: to.into(),
            bridge: Bridge::UuidString,
        }
    }

    fn scope() -> Vec<ScopeFilter> {
        vec![ScopeFilter {
            to: "store".into(),
            value: "{tenant}".into(),
        }]
    }

    fn regex_accepts(regex: &str, name: &str) -> bool {
        // the regexes are ^<literal>.+<literal>$ with escaped literals
        let body = regex.strip_prefix('^').unwrap().strip_suffix('$').unwrap();
        let (before, after) = body.split_once(".+").unwrap();
        let unescape = |s: &str| s.replace('\\', "");
        let (before, after) = (unescape(before), unescape(after));
        name.len() > before.len() + after.len()
            && name.starts_with(&before)
            && name.ends_with(&after)
    }

    #[test]
    fn pattern_regex_agrees_with_tenant_of() {
        assert_eq!(pattern_regex("shipments"), None);
        let regex = pattern_regex("{tenant}_orders").unwrap();
        assert_eq!(regex, "^.+_orders$");
        assert_eq!(pattern_regex("a.{tenant}(x)").unwrap(), "^a\\..+\\(x\\)$");
        for name in [
            "berlin_orders",
            "a_b_orders",
            "_orders",
            "berlin_customers",
            "x_orders_y",
        ] {
            assert_eq!(
                regex_accepts(&regex, name),
                tenant_of("{tenant}_orders", name).is_some(),
                "{name}"
            );
        }
    }

    #[test]
    fn picks_at_most_five_and_splits_the_sample() {
        let names: Vec<String> = (0..12).map(|i| format!("t{i:02}_orders")).collect();
        let picked = pick_random(names.clone(), PICK);
        assert_eq!(picked.len(), 5);
        assert!(picked.iter().all(|p| names.contains(p)));
        assert!(picked.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(pick_random(names[..2].to_vec(), PICK).len(), 2);
        assert_eq!(split(200, 3), vec![67, 67, 66]);
        assert_eq!(split(200, 5), vec![40; 5]);
        assert_eq!(split(50, 1), vec![50]);
        assert!(split(10, 0).is_empty());
    }

    #[test]
    fn id_shapes() {
        assert_eq!(kind_of(&uuid_bin(UUID)), Some(Kind::Uuid));
        assert_eq!(kind_of(&Bson::String(UUID.into())), Some(Kind::UuidText));
        assert_eq!(
            kind_of(&Bson::String(format!("{UUID}-ref"))),
            Some(Kind::UuidPrefixed)
        );
        assert_eq!(kind_of(&Bson::ObjectId(ObjectId::new())), Some(Kind::Oid));
        assert_eq!(
            kind_of(&Bson::String(ObjectId::new().to_hex())),
            Some(Kind::OidText)
        );
        assert_eq!(
            kind_of(&Bson::String("01ARZ3NDEKTSV4RRFFQ69G5FAV".into())),
            Some(Kind::IdText)
        );
        assert_eq!(
            kind_of(&Bson::String("deadbeefdeadbeef".into())),
            Some(Kind::IdText)
        );
        assert_eq!(
            kind_of(&Bson::String("12345".into())),
            Some(Kind::DigitsText)
        );
        assert_eq!(kind_of(&Bson::String("berlin".into())), Some(Kind::Text));
        assert_eq!(kind_of(&Bson::Int64(7)), Some(Kind::Int));
        assert_eq!(kind_of(&Bson::Double(7.5)), None);
        let other = Bson::Binary(Binary {
            subtype: BinarySubtype::Generic,
            bytes: vec![0; 16],
        });
        assert_eq!(kind_of(&other), None);
    }

    #[test]
    fn from_fields_keep_id_shaped_paths_up_to_depth_two() {
        let docs: Vec<Document> = (0..10)
            .map(|i| {
                doc! {
                    "_id": ObjectId::new(),
                    "key": uuid_bin(&uuid_n(i)),
                    "customerId": uuid_bin(&uuid_n(i % 3)),
                    "status": 1,
                    "seq": i as i64,
                    "text": "hello",
                    "meta": { "ref": uuid_n(i), "deep": { "id": uuid_n(i) } },
                    "items": [{ "sku": ObjectId::new().to_hex() }],
                }
            })
            .collect();
        let fields = from_fields(&docs);
        let by_path: HashMap<&str, &FromField> =
            fields.iter().map(|f| (f.path.as_str(), f)).collect();
        assert_eq!(by_path["key"].kind, Kind::Uuid);
        assert_eq!(by_path["key"].values.len(), 10);
        assert_eq!(by_path["customerId"].values.len(), 3);
        assert_eq!(by_path["meta.ref"].kind, Kind::UuidText);
        assert_eq!(by_path["items.sku"].kind, Kind::OidText);
        assert_eq!(by_path["seq"].kind, Kind::Int);
        assert_eq!(by_path["_id"].kind, Kind::Oid);
        // one distinct integer isn't an id; text isn't either; depth 3 isn't read
        assert!(!by_path.contains_key("status"));
        assert!(!by_path.contains_key("text"));
        assert!(!by_path.contains_key("meta.deep.id"));
        assert!(!by_path.contains_key("meta.deep"));
    }

    #[test]
    fn bridges_follow_the_types() {
        let to = |kinds: &[(Kind, usize)]| ToField {
            path: "x".into(),
            kinds: kinds.iter().copied().collect(),
            total: kinds.iter().map(|k| k.1).sum(),
        };
        let from = |kind: Kind| FromField {
            path: "x".into(),
            kind,
            values: vec![],
        };
        let one = |f: Kind, t: ToField| candidate_pairs(&[from(f)], &[t]).pop();
        let p = one(Kind::Uuid, to(&[(Kind::UuidText, 5)])).unwrap();
        assert_eq!((p.eq, p.prefix), (Some(Bridge::UuidString), None));
        let p = one(Kind::Uuid, to(&[(Kind::Uuid, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::AsStored));
        let p = one(Kind::Guid, to(&[(Kind::UuidText, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::GuidString));
        let p = one(Kind::UuidText, to(&[(Kind::Uuid, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::UuidString));
        let p = one(Kind::Oid, to(&[(Kind::OidText, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::OidString));
        let p = one(Kind::OidText, to(&[(Kind::Oid, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::OidString));
        let p = one(Kind::Int, to(&[(Kind::DigitsText, 5)])).unwrap();
        assert_eq!(p.eq, Some(Bridge::NumberString));
        // suffixed UUIDs only: "starts with" alone
        let p = one(
            Kind::Uuid,
            to(&[(Kind::UuidPrefixed, 4), (Kind::UuidText, 1)]),
        )
        .unwrap();
        assert_eq!(
            (p.eq, p.prefix),
            (Some(Bridge::UuidString), Some(Bridge::UuidString))
        );
        let p = one(Kind::UuidText, to(&[(Kind::UuidPrefixed, 4)])).unwrap();
        assert_eq!((p.eq, p.prefix), (None, Some(Bridge::AsStored)));
        // nothing the values could equal: no probe
        assert!(one(Kind::Uuid, to(&[(Kind::Text, 5)])).is_none());
        assert!(one(Kind::Int, to(&[(Kind::UuidText, 5)])).is_none());
        assert!(one(Kind::Oid, to(&[(Kind::Uuid, 5)])).is_none());
    }

    #[test]
    fn pairs_are_capped_and_named_alike_first() {
        let from: Vec<FromField> = (0..10)
            .map(|i| FromField {
                path: if i == 7 {
                    "customerId".into()
                } else {
                    format!("f{i}")
                },
                kind: Kind::Uuid,
                values: vec![],
            })
            .collect();
        let to: Vec<ToField> = (0..10)
            .map(|i| ToField {
                path: if i == 3 {
                    "customerId".into()
                } else {
                    format!("g{i}")
                },
                kinds: [(Kind::UuidText, 5)].into_iter().collect(),
                total: 5,
            })
            .collect();
        let pairs = candidate_pairs(&from, &to);
        assert_eq!(pairs.len(), MAX_PAIRS);
        assert_eq!((pairs[0].from, pairs[0].to), (7, 3));
        assert_eq!(name_affinity("key", "messageKey"), 50);
        assert_eq!(name_affinity("a.customerId", "customerid"), 100);
        assert_eq!(name_affinity("x", "ownerId"), 10);
    }

    #[test]
    fn counts_and_ranking() {
        let values: Vec<Bson> = (0..4).map(|i| uuid_bin(&uuid_n(i))).collect();
        let found: HashSet<String> = [uuid_n(0), uuid_n(2)].into_iter().collect();
        assert_eq!(count_eq(&values, Bridge::UuidString, &found), 2);
        let prefixes: Vec<String> = (0..4).map(uuid_n).collect();
        let found: HashSet<String> = [format!("{}-ref", uuid_n(1)), uuid_n(3)]
            .into_iter()
            .collect();
        assert_eq!(count_prefix(&prefixes, &found), 2);
        assert_eq!(anchored("a.b").unwrap().pattern.as_str(), "^a\\.b");

        let s = |from: &str, op: Op, matched: u32, sampled: u32| Suggestion {
            from: from.into(),
            to: "t".into(),
            op,
            bridge: Bridge::AsStored,
            matched,
            sampled,
        };
        let ranked = rank(vec![
            s("low", Op::Eq, 2, 10),
            s("mid", Op::Eq, 5, 10),
            s("top", Op::Eq, 1, 1),
            s("top", Op::Prefix, 1, 1),
            s("big", Op::Eq, 9, 10),
        ]);
        let names: Vec<(&str, Op)> = ranked.iter().map(|s| (s.from.as_str(), s.op)).collect();
        assert_eq!(
            names,
            // as many found either way: "starts with" wins, it also links suffixed values
            vec![("top", Op::Prefix), ("big", Op::Eq), ("mid", Op::Eq)]
        );
    }

    #[test]
    fn index_coverage_allows_scope_fields_first() {
        let indexes = vec![
            ("_id_".to_string(), doc! { "_id": 1 }),
            ("store_1_key_1".to_string(), doc! { "store": 1, "key": 1 }),
            (
                "other_1_externalId_1".to_string(),
                doc! { "other": 1, "externalId": 1 },
            ),
        ];
        let scope = vec!["store".to_string()];
        assert_eq!(
            covering_index(&indexes, &scope, "key"),
            Some("store_1_key_1")
        );
        assert_eq!(covering_index(&indexes, &scope, "_id"), Some("_id_"));
        assert_eq!(covering_index(&indexes, &scope, "externalId"), None);
        assert_eq!(covering_index(&indexes, &[], "key"), None);
    }

    #[test]
    fn index_lines_warn_with_a_hint() {
        let r = relation(
            vec![
                vec![cond("key", "key"), cond("customerId", "secondaryKey")],
                vec![Condition {
                    bridge: Bridge::AsStored,
                    ..cond("{customerId}-{key}", "externalId")
                }],
            ],
            scope(),
        );
        let indexes = vec![(
            "parcels".to_string(),
            vec![("store_1_key_1".to_string(), doc! { "store": 1, "key": 1 })],
        )];
        let lines = index_lines(&r, "logistics", &indexes);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].kind, LineKind::Ok);
        assert_eq!(lines[0].text, "Index store_1_key_1 on parcels (rule 1)");
        assert_eq!(lines[1].kind, LineKind::Warn);
        assert_eq!(
            lines[1].text,
            "No index on parcels.externalId: rule 2 scans the collection. Fine for a few rows; slow on millions."
        );
        let hint = lines[1].index.as_ref().unwrap();
        assert_eq!(hint.collection, "parcels");
        assert_eq!(hint.keys, vec!["store", "externalId"]);

        // a {tenant} target names the pattern
        let mut r = relation(vec![vec![cond("customerId", "key")]], vec![]);
        r.to.coll = "{tenant}_customers".into();
        let indexes: Vec<_> = ["a_customers", "b_customers"]
            .iter()
            .map(|c| {
                (
                    c.to_string(),
                    vec![("key_1".to_string(), doc! { "key": 1 })],
                )
            })
            .collect();
        let lines = index_lines(&r, "shop", &indexes);
        assert_eq!(
            lines[0].text,
            "Index key_1 on the 2 sampled {tenant}_customers collections"
        );
        let indexes = vec![
            indexes[0].clone(),
            (
                "b_customers".to_string(),
                vec![("_id_".to_string(), doc! { "_id": 1 })],
            ),
        ];
        let lines = index_lines(&r, "shop", &indexes);
        assert_eq!(lines[0].kind, LineKind::Warn);
        assert!(lines[0].text.starts_with("No index on key in 1 of the 2 sampled {tenant}_customers collections: the relation scans them."));
        assert_eq!(
            lines[0].index.as_ref().unwrap().collection,
            "{tenant}_customers"
        );
    }

    #[test]
    fn line_wording() {
        let o = |rule: Option<usize>, count: u64| Outcome { rule, count };
        let picked = Picked {
            collections: (0..5).map(|i| format!("t{i}_orders")).collect(),
            total: 10570,
            pattern: true,
        };
        let r = relation(
            vec![vec![cond("key", "key")], vec![cond("x", "y")]],
            scope(),
        );
        let outcomes = vec![o(Some(0), 1), o(Some(0), 3), o(Some(1), 2), o(None, 0)];
        let first = from_line(&r, &picked, &outcomes);
        assert_eq!(first.kind, LineKind::Ok);
        assert_eq!(
            first.text,
            "Sampled 4 orders in the 5 busiest of 20 tenants picked at random (of 10,570): rule 1 matched 2 · rule 2 matched 1 more · 1 have none (1–3 each, avg 2.0)"
        );
        let mut single = r.clone();
        single.rules.truncate(1);
        single.from_name = "shipments".into();
        let fixed = Picked {
            collections: vec!["m".into()],
            total: 1,
            pattern: false,
        };
        let first = from_line(&single, &fixed, &[o(Some(0), 2), o(Some(0), 2), o(None, 0)]);
        assert_eq!(
            first.text,
            "Sampled 3 orders: 2 have shipments (2 each) · 1 have none"
        );
        let nothing = from_line(&single, &fixed, &[o(None, 0)]);
        assert_eq!(nothing.kind, LineKind::Warn);

        let back = back_line(&r, Some(5), &[o(Some(0), 1), o(Some(1), 1), o(None, 0)]);
        assert_eq!(
            back.text,
            "Sampled 3 parcels documents in 5 tenants: 2 have a order · 1 don't (rule 2 found 1 of them)"
        );
        assert_eq!(
            back_line(&single, None, &[o(Some(0), 1)]).text,
            "Sampled 1 shipments: 1 have a order · 0 don't"
        );
        // a rule set on a doc that found nothing doesn't count
        assert_eq!(tally(&[o(Some(1), 0)], 2), (vec![0, 0], 1));
    }

    #[test]
    fn back_sample_keeps_five_tenants_preferring_the_sampled_ones() {
        let mut docs = Vec::new();
        for t in 0..8 {
            for _ in 0..(10 - t) {
                docs.push(doc! { "store": format!("t{t}") });
            }
        }
        docs.push(doc! { "nothing": 1 });
        let groups = trim_tenants(docs, "store", &["t7".to_string(), "t6".to_string()]);
        let names: Vec<&str> = groups.iter().map(|(t, _)| t.as_str()).collect();
        assert_eq!(names, vec!["t6", "t7", "t0", "t1", "t2"]);
        assert_eq!(groups[0].1.len(), 4);
        let r = relation(vec![vec![cond("key", "key")]], scope());
        assert_eq!(tenant_field(&r), Some("store"));
    }
}

#[cfg(test)]
mod live_tests {
    //! Against the server in `MONGO_STUDIO_TEST_URI`, on fixture databases
    //! named `studio_rel_s_*` that each test creates and drops:
    //!   MONGO_STUDIO_TEST_URI=mongodb://localhost:27017 \
    //!   cargo test --lib relations::sampling::live_tests -- --ignored
    use super::*;
    use crate::relations::model::{Condition, ScopeFilter, Side};

    /// Two clients to the same server stand for two connections.
    async fn clients() -> (Client, Client) {
        let uri = std::env::var("MONGO_STUDIO_TEST_URI")
            .expect("set MONGO_STUDIO_TEST_URI to run this test");
        (
            Client::with_uri_str(&uri).await.unwrap(),
            Client::with_uri_str(&uri).await.unwrap(),
        )
    }

    fn uuid_text(tenant: u32, kind: u32, n: u32) -> String {
        format!("{tenant:04x}{kind:04x}-{n:04x}-4597-b3e7-b394b1192a20")
    }

    fn uuid_bin(text: &str) -> Bson {
        convert(&Bson::String(text.to_string()), Bridge::UuidString)
    }

    async fn drop_dbs(client: &Client, dbs: &[&str]) {
        for db in dbs {
            client.database(db).drop().await.unwrap();
        }
    }

    #[tokio::test]
    #[ignore]
    async fn live_suggests_uuid_links_across_databases() {
        let (from, to) = clients().await;
        let (shop, logistics) = ("studio_rel_s_sug_shop", "studio_rel_s_sug_logistics");
        drop_dbs(&from, &[shop, logistics]).await;

        let mut shipments = Vec::new();
        for (t, tenant) in ["berlin", "acme"].iter().enumerate() {
            let t = t as u32;
            let orders: Vec<Document> = (0..30)
                .map(|i| {
                    doc! {
                        "key": uuid_bin(&uuid_text(t, 1, i)),
                        "customerId": uuid_bin(&uuid_text(t, 2, i / 3)),
                        "text": format!("order {i}"),
                        "status": 1,
                    }
                })
                .collect();
            from.database(shop)
                .collection::<Document>(&format!("{tenant}_orders"))
                .insert_many(orders)
                .await
                .unwrap();
            for i in 0..30 {
                // most split shipments carry a suffix on orderRef
                let key = uuid_text(t, 1, i);
                let message_id = if i % 5 == 0 {
                    key
                } else {
                    format!("{key}-ref")
                };
                shipments.push(doc! {
                    "store": *tenant,
                    "orderRef": message_id,
                    "customerId": uuid_text(t, 2, i / 3),
                    "amount": 1.5,
                });
            }
        }
        let coll = to.database(logistics).collection::<Document>("shipments");
        coll.insert_many(shipments).await.unwrap();
        coll.create_index(
            mongodb::IndexModel::builder()
                .keys(doc! { "orderRef": 1 })
                .build(),
        )
        .await
        .unwrap();

        let result = suggest_links(
            &from,
            &SampleSide {
                database: shop.into(),
                collection: "{tenant}_orders".into(),
            },
            &to,
            &SampleSide {
                database: logistics.into(),
                collection: "shipments".into(),
            },
        )
        .await;
        drop_dbs(&from, &[shop, logistics]).await;
        let suggestions = result.unwrap();

        let find = |f: &str, t: &str| suggestions.iter().find(|s| s.from == f && s.to == t);
        let key = find("key", "orderRef").expect("key -> orderRef");
        assert_eq!((key.op, key.bridge), (Op::Prefix, Bridge::UuidString));
        assert_eq!(key.matched, key.sampled);
        let customer = find("customerId", "customerId").expect("customerId -> customerId");
        assert_eq!((customer.op, customer.bridge), (Op::Eq, Bridge::UuidString));
        assert!(
            rate(customer.matched, customer.sampled) >= 0.8,
            "{customer:?}"
        );
        assert!(find("key", "customerId").is_none());
        assert!(suggestions.len() <= MAX_SUGGESTIONS);
    }

    #[tokio::test]
    #[ignore]
    async fn live_checks_rules_indexes_and_tenants() {
        let (from, to) = clients().await;
        let (shop, logistics) = ("studio_rel_s_chk_shop", "studio_rel_s_chk_logistics");
        drop_dbs(&from, &[shop, logistics]).await;

        let mut rows = Vec::new();
        for t in 0..8u32 {
            let tenant = format!("t{t}");
            let mut orders = Vec::new();
            for i in 0..50 {
                let (key, customer) = (uuid_text(t, 1, i), uuid_text(t, 2, i / 4));
                orders.push(doc! { "key": uuid_bin(&key), "customerId": uuid_bin(&customer) });
                match i % 10 {
                    0..=6 => {
                        rows.push(doc! { "store": &tenant, "key": &key, "secondaryKey": &customer })
                    }
                    7 | 8 => rows
                        .push(doc! { "store": &tenant, "externalId": format!("{customer}-{key}") }),
                    _ => {}
                }
            }
            for i in 0..10 {
                rows.push(doc! { "store": &tenant, "key": uuid_text(t, 9, i), "secondaryKey": uuid_text(t, 9, i) });
            }
            from.database(shop)
                .collection::<Document>(&format!("{tenant}_orders"))
                .insert_many(orders)
                .await
                .unwrap();
        }
        let coll = to.database(logistics).collection::<Document>("parcels");
        coll.insert_many(rows).await.unwrap();
        coll.create_index(
            mongodb::IndexModel::builder()
                .keys(doc! { "store": 1, "key": 1 })
                .build(),
        )
        .await
        .unwrap();

        let uuid_cond = |from: &str, to: &str| Condition {
            from: from.into(),
            op: Op::Eq,
            to: to.into(),
            bridge: Bridge::UuidString,
        };
        let relation = Relation {
            id: "r2".into(),
            name: "Parcels".into(),
            from: Side {
                conn: "any".into(),
                db: shop.into(),
                coll: "{tenant}_orders".into(),
            },
            to: Side {
                conn: "cluster".into(),
                db: logistics.into(),
                coll: "parcels".into(),
            },
            rules: vec![
                vec![
                    uuid_cond("key", "key"),
                    uuid_cond("customerId", "secondaryKey"),
                ],
                vec![Condition {
                    from: "{customerId}-{key}".into(),
                    op: Op::Eq,
                    to: "externalId".into(),
                    bridge: Bridge::UuidString,
                }],
            ],
            rule_notes: vec![],
            scope: vec![ScopeFilter {
                to: "store".into(),
                value: "{tenant}".into(),
            }],
            from_name: "parcels documents".into(),
            to_name: "order".into(),
            pairs: HashMap::new(),
            draft: None,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let result = check(&from, &to, &relation, "conn-shop").await;
        drop_dbs(&from, &[shop, logistics]).await;
        let (report, opened) = result.unwrap();
        for l in &report.lines {
            eprintln!("{:?}: {}", l.kind, l.text);
        }

        assert_eq!(report.sampled, 200);
        assert_eq!(report.rule_matches.len(), 2);
        let (r1, r2) = (report.rule_matches[0], report.rule_matches[1]);
        assert_eq!(r1 + r2 + report.none, 200);
        assert!((110..=170).contains(&r1), "rule 1 matched {r1}");
        assert!((20..=60).contains(&r2), "rule 2 matched {r2}");
        assert!((5..=40).contains(&report.none), "none {}", report.none);
        assert!(report.lines[0]
            .text
            .starts_with("Sampled 200 orders in the 5 busiest of 8 tenants: rule 1 matched"));

        // at most 5 tenant collections opened, both ways, the same tenants
        let side = |dir: Dir| -> HashSet<&str> {
            opened
                .iter()
                .filter(|(d, _)| *d == dir)
                .map(|(_, c)| c.as_str())
                .collect()
        };
        assert_eq!(side(Dir::From).len(), 5);
        assert!(!side(Dir::To).is_empty());
        assert!(side(Dir::To).is_subset(&side(Dir::From)));

        let back = report
            .lines
            .iter()
            .find(|l| {
                l.text
                    .starts_with("Sampled 200 parcels documents in 5 tenants")
            })
            .expect("back line");
        assert!(back.text.contains("have a order"), "{}", back.text);
        assert!(back.text.contains("rule 2 found"), "{}", back.text);

        assert!(report.lines.iter().any(
            |l| l.kind == LineKind::Ok && l.text.starts_with("Index store_1_key_1 on parcels")
        ));
        let warn = report
            .lines
            .iter()
            .find(|l| l.kind == LineKind::Warn && l.index.is_some())
            .expect("missing index line");
        let hint = warn.index.as_ref().unwrap();
        assert_eq!(
            (hint.database.as_str(), hint.collection.as_str()),
            (logistics, "parcels")
        );
        assert_eq!(hint.keys, vec!["store", "externalId"]);
    }
}
