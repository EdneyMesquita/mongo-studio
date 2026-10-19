import { isPattern } from "../../lib/relations";

/**
 * A mongosh script creating the index the check suggests. For a `{tenant}`
 * pattern it loops over the database's matching collections. It's only
 * opened in a console: nothing runs until Run is pressed.
 */
export function createIndexScript(relationName: string, index: { database: string; collection: string; keys: string[] }): string {
  const keys = index.keys.map((k) => `${JSON.stringify(k)}: 1`).join(", ");
  const head = `// Speeds up "${relationName || "this relation"}". Runs only when you press Run.`;
  const db = `db.getSiblingDB(${JSON.stringify(index.database)})`;
  if (!isPattern(index.collection)) {
    return `${head}\n${db}.getCollection(${JSON.stringify(index.collection)}).createIndex({ ${keys} });\n`;
  }
  const [before, after] = index.collection.split("{tenant}", 2);
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return `${head}
// One index per collection matching ${index.collection}: on a database with
// thousands of tenants this takes a while, and each build loads the server.
const target = ${db};
const names = target.getCollectionNames().filter((n) => /^${esc(before)}.+${esc(after)}$/.test(n));
print(\`\${names.length} collections\`);
for (const name of names) {
  target.getCollection(name).createIndex({ ${keys} });
}
`;
}
