//! A saved relation between two collections, as the frontend, the store and
//! the MCP tools share it (camelCase JSON).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Which connection a side lives on.
///
/// From: `"any"` (every connection holding the database) or a connection id.
/// To: `"cluster"` (the connection to the same cluster - same hosts - that
/// holds the database), `"same"` (the From connection itself) or an id.
pub type ConnRef = String;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Side {
    pub conn: ConnRef,
    pub db: String,
    /// A collection name, or a pattern holding `{tenant}`, e.g.
    /// `{tenant}_orders` for one collection per tenant.
    pub coll: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Op {
    /// The values are equal.
    Eq,
    /// The To value starts with the From value (text only).
    Prefix,
    /// The From field holds an array; any of its values links.
    In,
}

/// How the two sides' values compare when their types differ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Bridge {
    AsStored,
    /// UUID (Binary subtype 4) on one side, its dashed lowercase text on the other.
    UuidString,
    /// GUID (Binary subtype 3, .NET byte order) on one side, its text on the other.
    GuidString,
    /// ObjectId on one side, its 24-char hex on the other.
    OidString,
    /// A number on one side, its decimal text on the other.
    NumberString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    /// A field path on the From side (`customerId`, `items.sourceId`),
    /// or a template built from several, e.g. `{customerId}-{key}`.
    pub from: String,
    pub op: Op,
    /// A field path on the To side.
    pub to: String,
    #[serde(rename = "as")]
    pub bridge: Bridge,
}

/// A filter that always applies to the To side, e.g. `store = {tenant}`.
/// `value` is a template: `{tenant}` is the varying part of the From
/// collection's name, `{field}` a field of the From document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeFilter {
    pub to: String,
    pub value: String,
}

/// Who proposed a relation that isn't saved yet (an MCP client).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub by: String,
    /// ISO 8601.
    pub at: String,
    pub why: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: String,
    pub name: String,
    pub from: Side,
    pub to: Side,
    /// Alternative rules, tried in order per source document: a rule matches
    /// when all its conditions hold; the next is used only for documents the
    /// previous ones found nothing for.
    pub rules: Vec<Vec<Condition>>,
    #[serde(default)]
    pub rule_notes: Vec<String>,
    #[serde(default)]
    pub scope: Vec<ScopeFilter>,
    /// What the To documents are called from a From document ("shipments").
    pub from_name: String,
    /// What the From document is called from a To document ("order").
    pub to_name: String,
    /// Per From connection id: the To connection picked by hand (null skips it),
    /// overriding the cluster match.
    #[serde(default)]
    pub pairs: HashMap<String, Option<String>>,
    #[serde(default)]
    pub draft: Option<Draft>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Which side the documents in hand are on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dir {
    /// The documents are From documents; find their To documents.
    From,
    /// The documents are To documents; find their From documents.
    To,
}

/// An aggregate computed per source document over what it found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aggregate {
    /// The caller's key for the result.
    pub id: String,
    pub kind: AggregateKind,
    /// The summed or returned field (sum, first).
    #[serde(default)]
    pub field: Option<String>,
    /// Only found documents where this field equals `where_value`.
    #[serde(default)]
    pub where_field: Option<String>,
    #[serde(default)]
    pub where_value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AggregateKind {
    Count,
    Sum,
    Exists,
    First,
}
