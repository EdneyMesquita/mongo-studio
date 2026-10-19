import { bsonTypeName, isPlainObject } from "../../lib/bsonValue";
import type { RelationBridge, RelationCondition, RelationOp } from "../../types/relations";

/** One row of a document card in the relation editor: a field, or a path a condition names. */
export interface FieldRow {
  path: string;
  /** The last part, indented by `depth`. */
  label: string;
  depth: number;
  value: unknown;
  /** An object (or array of objects) whose fields can be listed under it. */
  expandable: boolean;
  /** Built from several fields: a `{a}-{b}` template. */
  built: boolean;
  /** Named by a condition but absent from this document. */
  missing: boolean;
}

/** The object whose fields a value lists: itself, or an array's first object. */
function inner(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value) && !Object.keys(value).some((k) => k.startsWith("$"))) return value;
  if (Array.isArray(value)) return value.find((v): v is Record<string, unknown> => isPlainObject(v)) ?? null;
  return null;
}

function valueAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    const obj = inner(cur);
    if (!obj || !(part in obj)) return undefined;
    cur = obj[part];
  }
  return cur;
}

/**
 * A document's fields as rows - top level, plus the fields of the objects
 * opened in `expanded` - then any path in `extra` (what conditions name)
 * that isn't a row yet.
 */
export function fieldRows(doc: unknown, extra: string[], expanded: Set<string>): FieldRow[] {
  const rows: FieldRow[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const child = inner(value);
      rows.push({ path, label: key, depth, value, expandable: child !== null && Object.keys(child).length > 0, built: false, missing: false });
      if (child && expanded.has(path)) walk(child, path, depth + 1);
    }
  };
  const top = inner(doc);
  if (top) walk(top, "", 0);
  for (const path of extra) {
    if (!path || rows.some((r) => r.path === path)) continue;
    const built = path.includes("{");
    const value = built ? undefined : valueAt(doc, path);
    rows.push({ path, label: path, depth: 0, value, expandable: false, built, missing: !built && value === undefined });
  }
  return rows;
}

/** "uuid", "string", "objectId"... the short type shown next to a field. */
export function shortType(value: unknown): string {
  if (value === undefined) return "";
  const name = bsonTypeName(value);
  return name === "Binary" ? "binary" : name.length > 8 ? name.slice(0, 7) + "…" : name.toLowerCase();
}

/** A template's text for a document: "{customerId}-{key}" -> "<customer>-<key>". */
export function fillTemplate(template: string, doc: unknown, text: (v: unknown) => string): string {
  return template.replace(/\{([^{}]+)\}/g, (_, path: string) => {
    const v = valueAt(doc, path);
    return v === undefined ? "" : text(v);
  });
}

export const OPS: [RelationOp, string][] = [
  ["eq", "equals"],
  ["prefix", "starts with"],
  ["in", "is in the array"],
];

export const BRIDGES: [RelationBridge, string][] = [
  ["as-stored", "As stored"],
  ["uuid-string", "UUID (Binary 4) ↔ text"],
  ["guid-string", "GUID .NET (Binary 3) ↔ text"],
  ["oid-string", "ObjectId ↔ text"],
  ["number-string", "Number ↔ text"],
];

/** The wire chip's text: "starts with · UUID ↔ text". */
export function conditionLabel(c: RelationCondition): string {
  const op = c.op === "prefix" ? "starts with · " : c.op === "in" ? "in array · " : "";
  const as = (BRIDGES.find((b) => b[0] === c.as)?.[1] ?? "").replace(" (Binary 4)", "").replace(" (Binary 3)", "");
  return op + as;
}

/** The Compare as a link starts with, from the two values' types. */
export function guessBridge(fromValue: unknown, toValue: unknown): RelationBridge {
  const kind = (v: unknown) => {
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (isPlainObject(v)) {
      if ("$oid" in v) return "oid";
      if ("$numberLong" in v || "$numberInt" in v || "$numberDouble" in v || "$numberDecimal" in v) return "number";
      const bin = v.$binary;
      if (isPlainObject(bin)) return bin.subType === "04" ? "uuid" : bin.subType === "03" ? "guid" : "binary";
    }
    return "other";
  };
  const a = kind(fromValue);
  const b = kind(toValue);
  if (a === b) return "as-stored";
  const pair = new Set([a, b]);
  if (pair.has("string")) {
    if (pair.has("uuid")) return "uuid-string";
    if (pair.has("guid")) return "guid-string";
    if (pair.has("oid")) return "oid-string";
    if (pair.has("number")) return "number-string";
  }
  return "as-stored";
}

/**
 * A template's text is compared with the To field as text; going back, its
 * parts are parsed out of that text and need converting to what the From
 * fields store. So a template over UUIDs compares as UUID ↔ text, not as
 * stored, or the way back finds nothing.
 */
export function templateBridge(from: string, current: RelationBridge, doc: unknown): RelationBridge {
  if (!from.includes("{") || current !== "as-stored") return current;
  const first = /\{([^{}]+)\}/.exec(from)?.[1];
  return first ? guessBridge(valueAt(doc, first), "") : current;
}
