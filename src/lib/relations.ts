import type { Relation, RelationAggregate, RelationDir, RelationSide } from "../types/relations";
import { isPlainObject, uuidText } from "./bsonValue";

/**
 * Relations on the frontend: which relations a collection takes part in,
 * and the names around them. Matching itself runs in the backend.
 */

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "{tenant}_orders" against "berlin_orders" -> "berlin"; an exact name -> ""; no match -> null. */
export function tenantOf(pattern: string, collection: string): string | null {
  if (!pattern.includes("{tenant}")) return pattern === collection ? "" : null;
  const [before, after] = pattern.split("{tenant}", 2);
  const m = new RegExp(`^${escapeRegExp(before)}(.+)${escapeRegExp(after)}$`).exec(collection);
  return m ? m[1] : null;
}

/** The collection a pattern names for a tenant. */
export function collectionFor(pattern: string, tenant: string): string {
  return pattern.replace("{tenant}", tenant);
}

export const isPattern = (coll: string) => coll.includes("{tenant}");

/** One end of a relation as a collection sees it. */
export interface RelationEnd {
  relation: Relation;
  /** "from": this collection is the From side, so the related documents are To documents. */
  dir: RelationDir;
  /** What the related documents are called from here, e.g. "shipments". */
  name: string;
  mine: RelationSide;
  other: RelationSide;
}

/** The saved relations (drafts don't count until saved) a collection of a connection takes part in. */
export function relationsOf(relations: Relation[], connectionId: string, database: string, collection: string): RelationEnd[] {
  return relations.flatMap((r): RelationEnd[] => {
    if (r.draft || !r.rules.some((rule) => rule.length)) return [];
    const out: RelationEnd[] = [];
    if (r.from.db === database && tenantOf(r.from.coll, collection) !== null && (r.from.conn === "any" || r.from.conn === connectionId)) {
      out.push({ relation: r, dir: "from", name: r.fromName || r.to.coll, mine: r.from, other: r.to });
    }
    const toConnOk = r.to.conn === "cluster" || r.to.conn === "same" || r.to.conn === connectionId;
    if (r.to.db === database && tenantOf(r.to.coll, collection) !== null && toConnOk) {
      out.push({ relation: r, dir: "to", name: r.toName || r.from.coll, mine: r.to, other: r.from });
    }
    return out;
  });
}

/** The scope field whose value is the tenant, if any ("store" for store = {tenant}). */
export function tenantField(relation: Relation): string | null {
  return relation.scope.find((s) => s.value === "{tenant}")?.to ?? null;
}

/**
 * The collection the related documents of `doc` live in: from the tenant in
 * this collection's name, or (from the To side) the field the scope ties
 * to the tenant. Null when it can't be told.
 */
export function otherCollection(end: RelationEnd, collection: string, doc?: unknown): string | null {
  if (!isPattern(end.other.coll)) return end.other.coll;
  const tenant = tenantOf(end.mine.coll, collection);
  if (tenant) return collectionFor(end.other.coll, tenant);
  const field = end.dir === "to" ? tenantField(end.relation) : null;
  if (!field || !isPlainObject(doc)) return null;
  const value = doc[field];
  return typeof value === "string" && value ? collectionFor(end.other.coll, value) : null;
}

/** "shop.{tenant}_orders → logistics.shipments" */
export function relationLabel(r: Relation): string {
  return `${r.from.db}.${r.from.coll} → ${r.to.db}.${r.to.coll}`;
}

/** A field value as the text relations compare: UUIDs dashed, ObjectIds as hex, numbers and strings as is. */
export function keyText(value: unknown): string {
  const uuid = uuidText(value);
  if (uuid) return uuid;
  if (isPlainObject(value)) {
    const [tag, inner] = Object.entries(value)[0] ?? [];
    if (tag === "$oid" && typeof inner === "string") return inner;
    if ((tag === "$numberLong" || tag === "$numberDecimal" || tag === "$numberInt" || tag === "$numberDouble") && typeof inner === "string") return inner;
    if (tag === "$date") return typeof inner === "string" ? inner : JSON.stringify(inner);
    if (tag === "$binary" && isPlainObject(inner) && typeof inner.base64 === "string") return inner.base64;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Every value at a dotted path, arrays flattened. */
export function valuesAt(doc: unknown, path: string): unknown[] {
  let cur: unknown[] = [doc];
  for (const part of path.split(".")) {
    cur = cur.flatMap((v) => {
      if (!isPlainObject(v) || !(part in v)) return [];
      const next = v[part];
      return Array.isArray(next) ? next : [next];
    });
  }
  return cur;
}

/** A Related column: an aggregate over a relation end's documents. */
export interface RelatedColumn extends RelationAggregate {
  relationId: string;
  dir: RelationDir;
}

/** "shipments DELIVERED", "parcels · Σ quantity (DELIVERED)", "customer · exists", "customer · number" */
export function relatedColumnTitle(name: string, col: RelatedColumn): string {
  const where = col.whereField ? keyText(col.whereValue) : "";
  switch (col.kind) {
    case "count":
      return where ? `${name} ${where}` : `${name} · count`;
    case "sum":
      return `${name} · Σ ${col.field}${where ? ` (${where})` : ""}`;
    case "exists":
      return `${name} · exists`;
    case "first":
      return `${name} · ${col.field}`;
  }
}

/** The "only these" filter of a column: exists -> missing, else not exactly one. */
export function relatedColumnFilterLabel(name: string, col: RelatedColumn): string {
  return col.kind === "exists" ? `${name} missing` : `${relatedColumnTitle(name, col)} ≠ 1`;
}

/** Whether a row passes a column's "only these" filter. */
export function failsRelatedColumn(col: RelatedColumn, value: unknown): boolean {
  return col.kind === "exists" ? value === false : value !== 1;
}

export const columnKey = (col: RelatedColumn) =>
  [col.relationId, col.dir, col.kind, col.field ?? "", col.whereField ?? "", JSON.stringify(col.whereValue ?? null)].join("|");

/**
 * A `{tenant}` pattern for a collection when others in its database share
 * its suffix ("berlin_orders" among "acme_orders", ... -> "{tenant}_orders"),
 * else its own name.
 */
export function guessPattern(collection: string, siblings: string[]): string {
  const cut = collection.lastIndexOf("_");
  if (cut <= 0) return collection;
  const suffix = collection.slice(cut);
  const alike = siblings.filter((c) => c !== collection && c.endsWith(suffix) && c.length > suffix.length).length;
  return alike >= 2 ? `{tenant}${suffix}` : collection;
}
