use bson::{Bson, Document};
use serde_json::Value;

use crate::error::{AppError, AppResult};

/// Converts a BSON document to relaxed Extended JSON, e.g. `ObjectId` becomes
/// `{"$oid": "..."}` and `DateTime` becomes `{"$date": "..."}`, so type
/// fidelity survives the trip to the frontend instead of silently degrading
/// to plain JSON strings/numbers.
pub fn document_to_json(doc: Document) -> Value {
    Bson::Document(doc).into_relaxed_extjson()
}

/// Parses a JSON object (optionally containing Extended JSON type tags) back
/// into a BSON document, e.g. for a user-submitted query filter.
pub fn json_to_document(value: Value) -> AppResult<Document> {
    match value {
        Value::Null => Ok(Document::new()),
        Value::Object(map) => Document::try_from(map)
            .map_err(|e| AppError::InvalidInput(format!("invalid document: {e}"))),
        _ => Err(AppError::InvalidInput("expected a JSON object".to_string())),
    }
}

/// Parses a JSON array of pipeline stages into BSON documents.
pub fn json_to_pipeline(value: Value) -> AppResult<Vec<Document>> {
    match value {
        Value::Array(items) => items.into_iter().map(json_to_document).collect(),
        _ => Err(AppError::InvalidInput(
            "expected a JSON array of pipeline stages".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bson::oid::ObjectId;
    use bson::{doc, DateTime};

    #[test]
    fn round_trips_object_id_and_date() {
        let oid = ObjectId::new();
        let date = DateTime::now();
        let original = doc! { "_id": oid, "createdAt": date, "count": 3i32 };

        let json = document_to_json(original.clone());
        assert_eq!(json["_id"]["$oid"], oid.to_hex());

        let back = json_to_document(json).unwrap();
        assert_eq!(back.get_object_id("_id").unwrap(), oid);
        assert_eq!(back.get_i32("count").unwrap(), 3);
    }

    #[test]
    fn rejects_non_object_filter() {
        let err = json_to_document(Value::String("nope".to_string()));
        assert!(err.is_err());
    }
}
