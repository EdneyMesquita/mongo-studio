/**
 * A filter on one line the way the Find bar shows one:
 * { "status": { "$in": ["shipped", "delivered"] } }. Text that isn't JSON
 * keeps its tokens with the line breaks folded.
 */
export function compactJson(code: string): string {
  try {
    return inline(JSON.parse(code));
  } catch {
    return code.replace(/\s*\r?\n\s*/g, " ").trim();
  }
}

function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}
