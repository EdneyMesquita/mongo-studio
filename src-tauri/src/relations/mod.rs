//! Relations: saved links between collections - in one database, two
//! databases, or two connections to the same cluster - that the app joins
//! itself, since MongoDB's `$lookup` can't reach across databases.
//!
//! - `model`: the relation as the frontend, the store and MCP share it.
//! - `bridge`: values at a path, "Compare as" conversions, `{…}` templates.
//! - `store`: relations.json in the config folder.
//! - `pairing`: which connection the other side lives on (same cluster = same hosts).
//! - `engine`: finds the related documents of a page of documents.
//! - `sampling`: link suggestions and the relation check, on small samples.

pub mod bridge;
pub mod engine;
pub mod model;
pub mod pairing;
pub mod sampling;
pub mod store;

pub use model::*;
pub use store::RelationsStore;

/// Emitted with the full list whenever relations change (the app or an MCP client).
pub const CHANGED_EVENT: &str = "relations-changed";
