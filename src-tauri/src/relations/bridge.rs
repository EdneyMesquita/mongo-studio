//! Values across a relation: reading them at a path, turning them into what
//! the other side stores ("Compare as"), and the `{…}` templates of field
//! expressions, collection patterns and scope filters.

use std::collections::HashMap;

use bson::spec::BinarySubtype;
use bson::{oid::ObjectId, Binary, Bson, Document};

use super::model::Bridge;

/// Every value at a dotted path, arrays flattened at each step:
/// `items.productId` on `{items: [{productId: "a"}, {productId: "b"}]}`
/// gives `["a", "b"]`. Like MongoDB's own paths, an array is opened one
/// level deep: arrays inside arrays aren't searched.
pub fn values_at(doc: &Document, path: &str) -> Vec<Bson> {
    let mut parts = path.split('.');
    let first = parts.next().unwrap_or_default();
    let start: Vec<&Bson> = doc.get(first).into_iter().flat_map(opened).collect();
    parts
        .fold(start, |values, part| {
            values
                .into_iter()
                .filter_map(|v| v.as_document()?.get(part))
                .flat_map(opened)
                .collect()
        })
        .into_iter()
        .cloned()
        .collect()
}

/// An array's items, or the value itself.
fn opened(value: &Bson) -> &[Bson] {
    match value {
        Bson::Array(items) => items,
        other => std::slice::from_ref(other),
    }
}

/// A UUID's dashed lowercase text from its 16 bytes.
fn uuid_text(bytes: &[u8]) -> String {
    let h: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

/// The 16 bytes of a dashed (or bare) UUID text, or None.
fn uuid_bytes(text: &str) -> Option<[u8; 16]> {
    let hex: String = text.chars().filter(|c| *c != '-').collect();
    if hex.len() != 32 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 16];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

/// .NET stores a GUID's first three groups little-endian: bytes 0-3, 4-5 and
/// 6-7 are reversed compared to the text order. The swap is its own inverse.
fn dotnet_swap(b: &[u8; 16]) -> [u8; 16] {
    [
        b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], b[8], b[9], b[10], b[11], b[12], b[13],
        b[14], b[15],
    ]
}

/// The text a value compares by across types: a UUID's dashed text, a GUID's
/// text in .NET order, an ObjectId's hex, a number's decimal text, a string
/// as it is. None for anything else (documents, dates, booleans...).
pub fn canonical(value: &Bson) -> Option<String> {
    match value {
        Bson::String(s) => Some(s.clone()),
        Bson::ObjectId(oid) => Some(oid.to_hex()),
        Bson::Int32(n) => Some(n.to_string()),
        Bson::Int64(n) => Some(n.to_string()),
        Bson::Double(f) if f.fract() == 0.0 && f.is_finite() => Some(format!("{}", *f as i64)),
        Bson::Double(f) => Some(f.to_string()),
        Bson::Binary(bin) if bin.bytes.len() == 16 => match bin.subtype {
            BinarySubtype::Uuid => Some(uuid_text(&bin.bytes)),
            BinarySubtype::UuidOld => {
                let b: [u8; 16] = bin.bytes.as_slice().try_into().ok()?;
                Some(uuid_text(&dotnet_swap(&b)))
            }
            _ => None,
        },
        _ => None,
    }
}

/// What to look for on the other side for one source value, as that side
/// stores it. Values that don't fit the bridge are returned unchanged.
pub fn convert(value: &Bson, bridge: Bridge) -> Bson {
    match (bridge, value) {
        (Bridge::AsStored, v) => v.clone(),
        (Bridge::UuidString, Bson::Binary(bin))
            if bin.subtype == BinarySubtype::Uuid && bin.bytes.len() == 16 =>
        {
            Bson::String(uuid_text(&bin.bytes))
        }
        (Bridge::UuidString, Bson::String(s)) => match uuid_bytes(s) {
            Some(bytes) => Bson::Binary(Binary {
                subtype: BinarySubtype::Uuid,
                bytes: bytes.to_vec(),
            }),
            None => value.clone(),
        },
        (Bridge::GuidString, Bson::Binary(bin))
            if bin.subtype == BinarySubtype::UuidOld && bin.bytes.len() == 16 =>
        {
            canonical(value)
                .map(Bson::String)
                .unwrap_or_else(|| value.clone())
        }
        (Bridge::GuidString, Bson::String(s)) => match uuid_bytes(s) {
            Some(bytes) => Bson::Binary(Binary {
                subtype: BinarySubtype::UuidOld,
                bytes: dotnet_swap(&bytes).to_vec(),
            }),
            None => value.clone(),
        },
        (Bridge::OidString, Bson::ObjectId(oid)) => Bson::String(oid.to_hex()),
        (Bridge::OidString, Bson::String(s)) => match ObjectId::parse_str(s) {
            Ok(oid) => Bson::ObjectId(oid),
            Err(_) => value.clone(),
        },
        (Bridge::NumberString, Bson::Int32(_) | Bson::Int64(_) | Bson::Double(_)) => {
            canonical(value)
                .map(Bson::String)
                .unwrap_or_else(|| value.clone())
        }
        (Bridge::NumberString, Bson::String(s)) => {
            if let Ok(n) = s.trim().parse::<i64>() {
                Bson::Int64(n)
            } else if let Ok(f) = s.trim().parse::<f64>() {
                Bson::Double(f)
            } else {
                value.clone()
            }
        }
        (_, v) => v.clone(),
    }
}

/// Whether a field expression is a template (`{customerId}-{key}`) rather than a path.
pub fn is_template(expr: &str) -> bool {
    expr.contains('{')
}

/// Fills `{name}` placeholders: `tenant` first, then the document's fields by
/// their canonical text. None when a placeholder has no value.
pub fn fill(template: &str, doc: Option<&Document>, tenant: Option<&str>) -> Option<String> {
    let mut out = String::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let end = rest[start..].find('}')? + start;
        let name = &rest[start + 1..end];
        let value = if name == "tenant" {
            tenant.map(str::to_string)
        } else {
            doc.and_then(|d| values_at(d, name).first().and_then(canonical))
        }?;
        out.push_str(&value);
        rest = &rest[end + 1..];
    }
    out.push_str(rest);
    Some(out)
}

/// The placeholder names in a template, in order.
pub fn placeholders(template: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        let Some(len) = rest[start..].find('}') else {
            break;
        };
        names.push(rest[start + 1..start + len].to_string());
        rest = &rest[start + len + 1..];
    }
    names
}

/// The values a filled template came from, for going back from the To side:
/// `{customerId}-{key}` on `"<uuid>-<uuid>"` gives both UUIDs. Placeholders take
/// a whole UUID when one starts there (UUIDs contain dashes, so splitting on
/// the separator alone is ambiguous), else the shortest text before the next
/// literal. None when the text doesn't fit the template.
pub fn parse_template(template: &str, text: &str) -> Option<HashMap<String, String>> {
    // literals between placeholders
    let mut parts: Vec<(Option<String>, String)> = Vec::new(); // (placeholder, literal after it)
    let mut rest = template;
    let first_literal_end = rest.find('{').unwrap_or(rest.len());
    let prefix = &rest[..first_literal_end];
    rest = &rest[first_literal_end..];
    while let Some(start) = rest.find('{') {
        let end = rest[start..].find('}')? + start;
        let name = rest[start + 1..end].to_string();
        rest = &rest[end + 1..];
        let lit_end = rest.find('{').unwrap_or(rest.len());
        parts.push((Some(name), rest[..lit_end].to_string()));
        rest = &rest[lit_end..];
    }
    let mut s = text.strip_prefix(prefix)?;
    let mut out = HashMap::new();
    let count = parts.len();
    for (i, (name, literal)) in parts.into_iter().enumerate() {
        let name = name?;
        let last = i + 1 == count;
        let take = if s.len() >= 36
            && uuid_bytes(&s[..36]).is_some()
            && s[36..].starts_with(literal.as_str())
            && (!last || s.len() == 36 + literal.len())
        {
            36
        } else if last {
            s.len().checked_sub(literal.len())?
        } else if literal.is_empty() {
            return None;
        } else {
            s.find(literal.as_str())?
        };
        out.insert(name, s[..take].to_string());
        s = s[take..].strip_prefix(literal.as_str())?;
    }
    s.is_empty().then_some(out)
}

/// The `{tenant}` part of a collection name matching a pattern: `"berlin"` for
/// `{tenant}_orders` and `berlin_orders`, `""` for a pattern without
/// `{tenant}` equal to the name, None when it doesn't match.
pub fn tenant_of(pattern: &str, collection: &str) -> Option<String> {
    let Some(at) = pattern.find("{tenant}") else {
        return (pattern == collection).then(String::new);
    };
    let before = &pattern[..at];
    let after = &pattern[at + "{tenant}".len()..];
    let middle = collection.strip_prefix(before)?.strip_suffix(after)?;
    (!middle.is_empty()).then(|| middle.to_string())
}

/// A collection pattern with its `{tenant}` filled.
pub fn collection_for(pattern: &str, tenant: &str) -> String {
    pattern.replace("{tenant}", tenant)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bson::doc;

    const TEXT: &str = "00112233-4455-6677-8899-aabbccddeeff";

    #[test]
    fn values_at_flattens_arrays() {
        let d =
            doc! { "a": { "b": 1 }, "list": [{ "id": "x" }, { "id": "y" }], "tags": ["p", "q"] };
        assert_eq!(values_at(&d, "a.b"), vec![Bson::Int32(1)]);
        assert_eq!(
            values_at(&d, "list.id"),
            vec![Bson::String("x".into()), Bson::String("y".into())]
        );
        assert_eq!(values_at(&d, "tags").len(), 2);
        assert!(values_at(&d, "missing.path").is_empty());

        // arrays at two levels of the path, and a plain document beside them
        let d = doc! { "a": [{ "b": [{ "c": 1 }, { "c": 2 }] }, { "b": { "c": 3 } }, 7] };
        assert_eq!(
            values_at(&d, "a.b.c"),
            vec![Bson::Int32(1), Bson::Int32(2), Bson::Int32(3)]
        );
        // an array inside an array isn't opened, as in MongoDB
        let d = doc! { "a": [[{ "b": 1 }]] };
        assert!(values_at(&d, "a.b").is_empty());
    }

    #[test]
    fn uuid_bridge_goes_both_ways() {
        let bin = Bson::Binary(Binary {
            subtype: BinarySubtype::Uuid,
            bytes: uuid_bytes(TEXT).unwrap().to_vec(),
        });
        assert_eq!(convert(&bin, Bridge::UuidString), Bson::String(TEXT.into()));
        assert_eq!(convert(&Bson::String(TEXT.into()), Bridge::UuidString), bin);
        assert_eq!(canonical(&bin).unwrap(), TEXT);
    }

    #[test]
    fn guid_bridge_uses_dotnet_byte_order() {
        // .NET: "00112233-4455-6677-..." is stored as 33 22 11 00 55 44 77 66 88 99 ...
        let stored = Bson::Binary(Binary {
            subtype: BinarySubtype::UuidOld,
            bytes: vec![
                0x33, 0x22, 0x11, 0x00, 0x55, 0x44, 0x77, 0x66, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd,
                0xee, 0xff,
            ],
        });
        assert_eq!(
            convert(&stored, Bridge::GuidString),
            Bson::String(TEXT.into())
        );
        assert_eq!(
            convert(&Bson::String(TEXT.into()), Bridge::GuidString),
            stored
        );
        assert_eq!(canonical(&stored).unwrap(), TEXT);
    }

    #[test]
    fn oid_and_number_bridges() {
        let oid = ObjectId::parse_str("6ab0e2f1c3d4e5f6a7b8c9d0").unwrap();
        assert_eq!(
            convert(&Bson::ObjectId(oid), Bridge::OidString),
            Bson::String(oid.to_hex())
        );
        assert_eq!(
            convert(&Bson::String(oid.to_hex()), Bridge::OidString),
            Bson::ObjectId(oid)
        );
        assert_eq!(
            convert(&Bson::Int32(42), Bridge::NumberString),
            Bson::String("42".into())
        );
        assert_eq!(
            convert(&Bson::String("42".into()), Bridge::NumberString),
            Bson::Int64(42)
        );
        // values that don't fit pass through
        assert_eq!(
            convert(&Bson::String("nope".into()), Bridge::OidString),
            Bson::String("nope".into())
        );
    }

    #[test]
    fn templates_fill_and_parse_back() {
        let customer = "eed4b0b7-04c8-4597-b3e7-b394b1192a20";
        let key = "47160a27-7f72-476b-9874-a39c71bec7e3";
        let d = doc! { "customerId": customer, "key": key };
        let filled = fill("{customerId}-{key}", Some(&d), None).unwrap();
        assert_eq!(filled, format!("{customer}-{key}"));
        let back = parse_template("{customerId}-{key}", &filled).unwrap();
        assert_eq!(back["customerId"], customer);
        assert_eq!(back["key"], key);
        assert_eq!(
            fill("{tenant}_orders", None, Some("berlin")).unwrap(),
            "berlin_orders"
        );
        assert!(fill("{missing}", Some(&d), None).is_none());
        assert_eq!(placeholders("{a}-{b}"), vec!["a", "b"]);
        let plain = parse_template("{a}:{b}", "x:y").unwrap();
        assert_eq!((plain["a"].as_str(), plain["b"].as_str()), ("x", "y"));
    }

    #[test]
    fn tenant_patterns() {
        assert_eq!(
            tenant_of("{tenant}_orders", "berlin_orders").as_deref(),
            Some("berlin")
        );
        assert_eq!(
            tenant_of("{tenant}_orders", "a_b_orders").as_deref(),
            Some("a_b")
        );
        assert_eq!(tenant_of("{tenant}_orders", "berlin_customers"), None);
        assert_eq!(tenant_of("shipments", "shipments").as_deref(), Some(""));
        assert_eq!(
            collection_for("{tenant}_customers", "berlin"),
            "berlin_customers"
        );
    }
}
