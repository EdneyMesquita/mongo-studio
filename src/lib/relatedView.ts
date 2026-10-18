import type { RelatedFound, RelationAggregate } from "../types/relations";
import { bsonLiteral, isPlainObject, uuidText } from "./bsonValue";
import { typeName } from "./bsonFormat";
import { columnKey, keyText, type RelatedColumn, type RelationEnd } from "./relations";

/**
 * What the results view shows of related documents: the inspector's doc
 * lines, the Related menu's suggestions, the grid's totals, the filter that
 * opens related documents in a tab.
 */

/** A Related column for an end, its id the key the backend echoes in `aggregates`. */
export function relatedColumn(end: RelationEnd, agg: Omit<RelationAggregate, "id">): RelatedColumn {
  const col: RelatedColumn = { ...agg, id: "", relationId: end.relation.id, dir: end.dir };
  return { ...col, id: columnKey(col) };
}

/** A number as stored: plain, or a relaxed Extended JSON numeric wrapper; null for anything else. */
export function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!isPlainObject(value)) return null;
  const [tag, inner] = Object.entries(value)[0] ?? [];
  if ((tag === "$numberInt" || tag === "$numberLong" || tag === "$numberDouble" || tag === "$numberDecimal") && typeof inner === "string") {
    const n = Number(inner);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Whether a Related cell looks wrong: a count or sum other than 1, a missing related document. */
export function isOddRelated(col: RelatedColumn, value: unknown): boolean {
  if (value === undefined) return false;
  if (col.kind === "exists") return value === false;
  if (col.kind === "count" || col.kind === "sum") return numberOf(value) !== 1;
  return false;
}

/** A column's footer over the rows shown: a total for count and sum, "n yes" for exists, nothing for first. */
export function relatedTotal(col: RelatedColumn, values: unknown[]): string | null {
  if (col.kind === "first") return null;
  if (col.kind === "exists") return `${values.filter((v) => v === true).length.toLocaleString("en")} yes`;
  let total = 0;
  for (const v of values) total += numberOf(v) ?? 0;
  return total.toLocaleString("en");
}

/** The fields of the other side a relation links on or scopes by: constant or id-like, so never worth showing. */
export function linkFields(end: RelationEnd): Set<string> {
  const out = new Set<string>(["_id"]);
  for (const rule of end.relation.rules) for (const c of rule) out.add(end.dir === "from" ? c.to : c.from);
  if (end.dir === "from") for (const s of end.relation.scope) out.add(s.to);
  return out;
}

/** A value short enough to read on one line: strings up to 40 characters, numbers, booleans, dates. */
function isShortScalar(value: unknown): boolean {
  if (typeof value === "string") return value.length > 0 && value.length <= 40;
  if (typeof value === "boolean" || numberOf(value) !== null) return true;
  return typeName(value) === "Date";
}

/** Fields that say what a document is, shown first on its line. */
const KIND_FIELDS = ["status", "state", "type", "kind"];

/**
 * A related document as one line: the end of its _id, then a few short
 * fields - a status-like one first, then a date, then the rest in order.
 */
export function relatedDocLine(doc: unknown, skip: Set<string>, max = 3): { id: string; fields: [string, unknown][] } {
  if (!isPlainObject(doc)) return { id: "", fields: [] };
  const id = doc._id === undefined ? "" : keyText(doc._id).slice(-6);
  const rank = ([key, value]: [string, unknown]) => (KIND_FIELDS.includes(key) ? 0 : typeName(value) === "Date" ? 1 : 2);
  const fields = Object.entries(doc)
    .filter(([key, value]) => !skip.has(key) && isShortScalar(value))
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.i - b.i)
    .slice(0, max)
    .map(({ entry }) => entry);
  return { id, fields };
}

export interface RelatedSuggestion {
  label: string;
  icon: "count" | "where" | "sum" | "exists" | "first";
  column: RelatedColumn;
}

/** The related documents loaded for a page, flattened. */
const loadedDocs = (results: RelatedFound[]) => results.flatMap((r) => r.docs).filter(isPlainObject);

/** Per top-level field, how often each value shows up. */
function tally(docs: Record<string, unknown>[], pick: (value: unknown) => boolean, skip: Set<string>) {
  const fields = new Map<string, Map<string, { value: unknown; n: number }>>();
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (skip.has(key) || !pick(value)) continue;
      const values = fields.get(key) ?? new Map();
      const text = keyText(value);
      const seen = values.get(text);
      values.set(text, { value, n: (seen?.n ?? 0) + 1 });
      fields.set(key, values);
    }
  }
  return fields;
}

/** At most this many values before a string field stops reading like a status. */
const LOW_CARDINALITY = 8;

/**
 * What the Related menu offers for an end, from the related documents of
 * the page loaded so far: a count and whether there's one; "count where" for
 * the values of a status-like string field (few values, repeating); a sum
 * of each numeric field; for a relation that finds one document, a field
 * of it.
 */
export function relatedSuggestions(end: RelationEnd, results: RelatedFound[]): RelatedSuggestion[] {
  const name = end.name;
  const skip = linkFields(end);
  const docs = loadedDocs(results);
  const many = results.some((r) => r.count > 1);
  const one = results.length > 0 && !many;
  const out: RelatedSuggestion[] = [];
  const add = (label: string, icon: RelatedSuggestion["icon"], agg: Omit<RelationAggregate, "id">) =>
    out.push({ label, icon, column: relatedColumn(end, agg) });

  if (!one) add(`Count of ${name}`, "count", { kind: "count" });

  // the status-like field: few distinct short strings, some of them repeating
  const strings = tally(docs, (v) => typeof v === "string" && v.length > 0 && v.length <= 32, skip);
  const statusLike = [...strings.entries()]
    .map(([field, values]) => {
      const counts = [...values.values()];
      const occurrences = counts.reduce((s, c) => s + c.n, 0);
      return { field, counts, distinct: counts.length, occurrences };
    })
    .filter((f) => f.distinct <= LOW_CARDINALITY && f.occurrences > f.distinct)
    .sort((a, b) => Number(b.distinct >= 2) - Number(a.distinct >= 2) || a.distinct - b.distinct || b.occurrences - a.occurrences)[0];
  if (statusLike && !one) {
    for (const { value } of statusLike.counts.sort((a, b) => b.n - a.n).slice(0, 2)) {
      add(`Count where ${statusLike.field} = ${keyText(value)}`, "where", { kind: "count", whereField: statusLike.field, whereValue: value });
    }
  }

  const numbers = tally(docs, (v) => numberOf(v) !== null, skip);
  const numeric = [...numbers.entries()]
    .map(([field, values]) => ({ field, n: [...values.values()].reduce((s, c) => s + c.n, 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 2);
  for (const { field } of numeric) add(`Sum of ${field}`, "sum", { kind: "sum", field });

  add(one ? `Whether there's a ${name}` : `Whether it has any ${name}`, "exists", { kind: "exists" });

  if (one) {
    const firsts: string[] = [];
    for (const doc of docs) {
      for (const [key, value] of Object.entries(doc)) {
        if (firsts.length < 2 && !skip.has(key) && !firsts.includes(key) && isShortScalar(value)) firsts.push(key);
      }
    }
    for (const field of firsts) add(`${name} · ${field}`, "first", { kind: "first", field });
  }
  return out;
}

/** A value as a filter spells it, mongosh style. */
function literal(value: unknown): string {
  const uuid = uuidText(value);
  if (uuid) return `UUID("${uuid}")`;
  return bsonLiteral(value) ?? JSON.stringify(value);
}

/** The filter of the related documents found: `{ _id: { $in: [...] } }`, or one _id alone. */
export function idFilterText(docs: unknown[]): string | null {
  const ids = docs.filter(isPlainObject).map((d) => d._id).filter((id) => id !== undefined);
  if (ids.length === 0) return null;
  if (ids.length === 1) return `{ _id: ${literal(ids[0])} }`;
  return `{ _id: { $in: [${ids.map(literal).join(", ")}] } }`;
}

/** A field's dotted path as relations name it: array indexes left out ("items.0.sku" -> "items.sku"). */
export function fieldPathOf(doc: unknown, path: string[]): string {
  const out: string[] = [];
  let cur: unknown = doc;
  for (const part of path) {
    if (Array.isArray(cur)) {
      cur = cur[Number(part)];
      continue;
    }
    out.push(part);
    cur = isPlainObject(cur) ? cur[part] : undefined;
  }
  return out.join(".");
}
