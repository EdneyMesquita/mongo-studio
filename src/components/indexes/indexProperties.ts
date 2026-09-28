import { isPlainObject } from "../../lib/bsonValue";

/**
 * The index options worth a tag, from what we have: `unique` from the
 * collection stats, the rest from the `$indexStats` spec when it came back.
 */
export function indexProperties(unique: boolean, spec: Record<string, unknown> | null): string[] {
  const tags: string[] = [];
  if (unique || spec?.unique === true) tags.push("unique");
  if (spec?.sparse === true) tags.push("sparse");
  if (typeof spec?.expireAfterSeconds === "number") tags.push(`TTL ${spec.expireAfterSeconds}s`);
  if (isPlainObject(spec?.partialFilterExpression)) tags.push("partial");
  if (spec?.hidden === true) tags.push("hidden");
  return tags;
}
