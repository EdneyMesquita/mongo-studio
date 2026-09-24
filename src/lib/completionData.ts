import { api } from "./tauri";
import { childEntries } from "./bsonValue";
import type { CompletionSource } from "./mongoCompletion";

/** Documents sampled to learn a collection's field names. */
const SAMPLE_SIZE = 200;
const MAX_DEPTH = 6;
const MAX_FIELDS = 1000;

/**
 * Dotted paths of every field in `docs`, in first-seen order: `props.path`,
 * and `items.qty` for an array of documents (array indexes left out, as in
 * a query). BSON wrappers like {"$oid": …} are values, not sub-documents.
 */
export function flattenFieldPaths(docs: unknown[]): string[] {
  const seen = new Set<string>();

  function walk(value: unknown, prefix: string, depth: number) {
    if (depth > MAX_DEPTH || seen.size >= MAX_FIELDS) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, prefix, depth);
      return;
    }
    const entries = childEntries(value);
    if (entries === null) return;
    for (const [key, child] of entries) {
      const path = prefix ? `${prefix}.${key}` : key;
      seen.add(path);
      walk(child, path, depth + 1);
    }
  }

  for (const doc of docs) walk(doc, "", 0);
  return [...seen];
}

// Keyed by session so a reconnect or another server starts fresh. Failed
// lookups are dropped from the cache so the next keystroke retries.
const collectionsCache = new Map<string, Promise<string[]>>();
const fieldsCache = new Map<string, Promise<string[]>>();

function cached(cache: Map<string, Promise<string[]>>, key: string, load: () => Promise<string[]>) {
  let entry = cache.get(key);
  if (!entry) {
    entry = load().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, entry);
  }
  return entry;
}

/** Collection and field names of one database, for the completion engine. */
export function completionSource(sessionId: string, database: string): CompletionSource {
  return {
    collections: () =>
      cached(collectionsCache, `${sessionId}\u0000${database}`, async () =>
        (await api.listCollections(sessionId, database)).map((c) => c.name).sort(),
      ),
    fields: (collection) =>
      cached(fieldsCache, `${sessionId}\u0000${database}\u0000${collection}`, async () => {
        const page = await api.runAggregate(sessionId, database, collection, [
          { $sample: { size: SAMPLE_SIZE } },
        ]);
        return flattenFieldPaths(page.documents);
      }),
  };
}
