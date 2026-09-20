function formatIdForScript(id: unknown): string {
  if (id && typeof id === "object" && "$oid" in id) {
    return `ObjectId(${JSON.stringify((id as { $oid: string }).$oid)})`;
  }
  if (typeof id === "string") return JSON.stringify(id);
  if (typeof id === "number" || typeof id === "boolean") return String(id);
  return JSON.stringify(id);
}

/**
 * Builds a JS console script pre-filled to update one document by _id,
 * seeded with its current field values so editing means changing values
 * in place rather than typing the whole document from scratch.
 */
export function buildEditScript(doc: Record<string, unknown>, collectionName: string): string {
  const idExpr = formatIdForScript(doc["_id"]);
  const rest = Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "_id"));
  const setBody = JSON.stringify(rest, null, 2);

  return `// Edit document ${idExpr}
const filter = { _id: ${idExpr} };
const update = {
  $set: ${setBody}
};
await db.collection(${JSON.stringify(collectionName)}).updateOne(filter, update);
`;
}
