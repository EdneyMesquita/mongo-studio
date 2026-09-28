//! The system prompt both agents get, appended to their own (Claude's
//! `--append-system-prompt`, Codex's `developer_instructions`). It tells the
//! agent where it is, that the tools are its only (read-only) access, and
//! the answer format the app's UI turns into runnable proposals.

use super::{AgentSession, Purpose};

pub(crate) fn system_prompt(session: &AgentSession) -> String {
    build(
        session.purpose,
        &session.database,
        &session.connection_name,
        session.server_version.as_deref(),
        session.collection.as_deref(),
    )
}

pub(crate) fn build(
    purpose: Purpose,
    database: &str,
    connection_name: &str,
    server_version: Option<&str>,
    collection: Option<&str>,
) -> String {
    let version = match server_version {
        Some(v) if !v.is_empty() => format!("MongoDB {v}"),
        _ => "MongoDB unknown version".to_string(),
    };
    let looking_at = match collection {
        Some(c) => format!(" The user is looking at the collection \"{c}\"."),
        None => String::new(),
    };
    let mut prompt = format!(
        "You are the Assistant inside Mongo Studio, a desktop MongoDB client. You write MongoDB queries and scripts for the user.
This session reads the database \"{database}\" on the connection \"{connection_name}\" ({version}).{looking_at}
Tools: the mongo_studio tools are your only access to the data, and they are read-only. Learn the schema with sample_schema before writing a query; never guess field names or types. Check indexes and plans with list_indexes and explain when performance matters. Dry-run pipelines with aggregate before proposing them. Reading document values may ask the user first; ask only when names and types are not enough.
You cannot change data. When a request needs a write, propose a console script; it runs only when the user presses Run.
Answer format: short prose (two to four sentences, no headings, no tables), then each proposal in its own fenced block, with the collection after the language when it targets one:
```filter orders      -> a find filter, one JSON object (Extended JSON: {{\"$oid\": \"...\"}}, {{\"$date\": \"2026-01-31T00:00:00Z\"}}, {{\"$numberDecimal\": \"10.5\"}})
```pipeline orders    -> an aggregation pipeline, a JSON array of stages, same Extended JSON
```js                 -> a console script for the \"{database}\" database
Console scripts: db.collection(name) has find(filter, {{ limit, sort, skip, projection }}), findOne(filter), insertOne(doc), insertMany(docs), updateOne(filter, update), updateMany(filter, update), deleteOne(filter), deleteMany(filter), aggregate(pipeline) and countDocuments(filter). All return promises; top-level await works; the script's last expression is its result; print() writes to the log; ObjectId(\"hex\") and ISODate(\"iso\") build BSON values."
    );
    if purpose == Purpose::Inline {
        prompt.push_str(
            "\nReply with exactly one fenced block (the filter, pipeline or complete script asked for) and at most one short sentence before it.",
        );
    }
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_in_the_session() {
        let prompt = build(
            Purpose::Chat,
            "shop",
            "Local",
            Some("8.0.19"),
            Some("orders"),
        );
        assert!(prompt.contains(
            "This session reads the database \"shop\" on the connection \"Local\" (MongoDB 8.0.19). The user is looking at the collection \"orders\".\nTools:"
        ));
        assert!(prompt.contains("a console script for the \"shop\" database"));
        assert!(prompt.contains("{\"$oid\": \"...\"}"));
        assert!(!prompt.contains("exactly one fenced block"));
    }

    #[test]
    fn inline_asks_for_one_block_and_version_may_be_unknown() {
        let prompt = build(Purpose::Inline, "shop", "Local", None, None);
        assert!(prompt.contains("(MongoDB unknown version).\nTools:"));
        assert!(prompt.ends_with("at most one short sentence before it."));
    }
}
