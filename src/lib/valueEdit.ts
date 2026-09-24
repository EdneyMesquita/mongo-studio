import { dateIso, isPlainObject } from "./bsonValue";

/**
 * How a value is edited in place. Each kind keeps the value's BSON type:
 * the text typed in goes back out as the same Extended JSON shape it came
 * in as.
 */
export type EditKind =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "date"
  | "objectId"
  | "decimal"
  | "long";

/** The edit kind for a value, or null when it can't be edited in place. */
export function editKindOf(value: unknown): EditKind | null {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      // An Int64 past 2^53 already lost digits parsing into a JS number;
      // saving it back would write the rounded value.
      if (!Number.isFinite(value)) return null;
      return Number.isInteger(value) && !Number.isSafeInteger(value) ? null : "number";
    case "boolean":
      return "boolean";
  }
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  switch (keys[0]) {
    case "$date":
      return dateIso(value) !== null ? "date" : null;
    case "$oid":
      return typeof value.$oid === "string" ? "objectId" : null;
    case "$numberDecimal":
      return "decimal";
    case "$numberLong":
      return "long";
    default:
      // Binary, regex, timestamp, MinKey... have no sensible one-line form.
      return null;
  }
}

/** The text an editor starts from. */
export function editText(value: unknown, kind: EditKind): string {
  switch (kind) {
    case "string":
      return value as string;
    case "number":
    case "boolean":
      return String(value);
    case "null":
      return "null";
    case "date":
      return dateIso(value) ?? "";
    case "objectId":
      return String((value as { $oid: string }).$oid);
    case "decimal":
      return String((value as { $numberDecimal: string }).$numberDecimal);
    case "long":
      return String((value as { $numberLong: string }).$numberLong);
  }
}

export type ParsedEdit = { ok: true; value: unknown } | { ok: false; error: string };

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INTEGER = /^[+-]?\d+$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Turns edited text back into a value of the same kind, as Extended JSON. */
export function parseEdit(text: string, kind: EditKind): ParsedEdit {
  const trimmed = text.trim();
  switch (kind) {
    case "string":
      return { ok: true, value: text };
    case "number": {
      const n = Number(trimmed);
      return trimmed !== "" && Number.isFinite(n)
        ? { ok: true, value: n }
        : { ok: false, error: "Not a number" };
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (lower === "true" || lower === "false") return { ok: true, value: lower === "true" };
      return { ok: false, error: "Use true or false" };
    }
    case "null":
      // A null field has no type to keep, so read a JSON literal ("text",
      // 12, true, null) and fall back to a plain string.
      if (trimmed === "") return { ok: true, value: "" };
      try {
        return { ok: true, value: JSON.parse(trimmed) };
      } catch {
        return { ok: true, value: text };
      }
    case "date": {
      const time = new Date(trimmed).getTime();
      return Number.isFinite(time)
        ? { ok: true, value: { $date: new Date(time).toISOString() } }
        : { ok: false, error: "Not a date - e.g. 2026-09-23T14:30:00Z" };
    }
    case "objectId":
      return OBJECT_ID.test(trimmed)
        ? { ok: true, value: { $oid: trimmed.toLowerCase() } }
        : { ok: false, error: "An ObjectId is 24 hex characters" };
    case "decimal":
      return DECIMAL.test(trimmed)
        ? { ok: true, value: { $numberDecimal: trimmed } }
        : { ok: false, error: "Not a decimal number" };
    case "long":
      return INTEGER.test(trimmed)
        ? { ok: true, value: { $numberLong: trimmed } }
        : { ok: false, error: "Not a whole number" };
  }
}

/**
 * Whether a field can be written with `$set` from this path: not `_id`
 * (immutable), and no segment MongoDB would read as something else. Mirrors
 * the backend's check, so the editor doesn't open on a field it can't save.
 */
export function isEditablePath(path: string[]): boolean {
  if (path.length === 0 || path[0] === "_id") return false;
  return path.every((s) => s !== "" && !s.includes(".") && !s.startsWith("$"));
}
