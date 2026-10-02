import { parseQueryObject } from "../queryText";

/** The changed span of `after` against `before`: common prefix and suffix trimmed. */
export function changedSpan(before: string, after: string): { start: number; end: number } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let tail = 0;
  while (
    tail < max - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  return { start, end: after.length - tail };
}

/**
 * Lines of `after` that aren't in `before` (by longest common subsequence),
 * as 0-based indexes, and how many lines of `before` are gone.
 */
export function lineDiff(before: string, after: string): { added: number[]; removed: number } {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  // lcs[i][j]: common subsequence length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < n && lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else added.push(j++);
  }
  return { added, removed: n - lcs[0][0] };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 conditions added", "1 condition changed, 1 removed", or "filter rewritten". */
export function filterChangeSummary(before: string, after: string): string {
  let a: Record<string, unknown>;
  let b: Record<string, unknown>;
  try {
    // Compared as values, so ObjectId("…") in one and {"$oid": "…"} in the
    // other count as the same condition.
    a = parseQueryObject(before);
    b = parseQueryObject(after);
  } catch {
    return "filter rewritten";
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return "filter rewritten";
  const added = Object.keys(b).filter((k) => !(k in a)).length;
  const removed = Object.keys(a).filter((k) => !(k in b)).length;
  const changed = Object.keys(b).filter(
    (k) => k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  ).length;
  const parts: string[] = [];
  if (added) parts.push(`${plural(added, "condition", "conditions")} added`);
  if (changed) parts.push(parts.length ? `${changed} changed` : `${plural(changed, "condition", "conditions")} changed`);
  if (removed) parts.push(parts.length ? `${removed} removed` : `${plural(removed, "condition", "conditions")} removed`);
  return parts.join(", ") || "no change";
}

/** "1 line added", "3 lines added, 1 removed". */
export function scriptChangeSummary(added: number, removed: number): string {
  if (!added && !removed) return "no change";
  if (!added) return `${plural(removed, "line", "lines")} removed`;
  return removed ? `${plural(added, "line", "lines")} added, ${removed} removed` : `${plural(added, "line", "lines")} added`;
}
