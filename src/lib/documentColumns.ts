import { childEntries, isPlainObject } from "./bsonValue";
import { typeName } from "./bsonFormat";

export interface DocumentColumn {
  /** The top-level field. */
  key: string;
  /** Its BSON type name, taken from the first document that has a value for it. */
  type: string;
}

/** Order: _id, then scalars as stored, then nested fields, then references (other ObjectIds). */
function rank(key: string, sample: unknown): number {
  if (key === "_id") return 0;
  if (typeName(sample) === "ObjectId") return 3;
  if (childEntries(sample) !== null) return 2;
  return 1;
}

/** The grid's columns: the union of the documents' top-level fields. */
export function columnsOf(documents: unknown[]): DocumentColumn[] {
  const order: string[] = [];
  const samples = new Map<string, unknown>();
  for (const doc of documents) {
    if (!isPlainObject(doc)) continue;
    for (const [key, value] of Object.entries(doc)) {
      if (!samples.has(key)) {
        order.push(key);
        samples.set(key, value);
      } else if (samples.get(key) === null && value !== null) {
        // a null says nothing about the field's type; keep looking
        samples.set(key, value);
      }
    }
  }
  return order
    .map((key, i) => ({ key, i, rank: rank(key, samples.get(key)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ key }) => ({ key, type: typeName(samples.get(key)) }));
}
