import { useEffect, useState } from "react";
import { api } from "../../lib/tauri";
import { pipelineWrites } from "../../lib/assistant/answer";
import { parseQueryValue } from "../../lib/queryText";
import type { Proposal } from "../../lib/assistant/answer";
import { useConnectionsStore } from "../../store/connectionsStore";

export type DryRun =
  | { state: "running" }
  | { state: "done"; count: number; capped: boolean; ms: number }
  | { state: "skipped"; reason: string }
  | { state: "error"; message: string };

/** Beyond this many results a dry run says "1,000+". */
const CAP = 1000;

// One run per proposal, whichever card or strip asks, for the app's life.
const runs = new Map<string, Promise<DryRun>>();

async function dryRun(sessionId: string, database: string, collection: string, proposal: Proposal): Promise<DryRun> {
  // Read the way the Find bar reads it, so a proposal that dry-runs also runs.
  let parsed: unknown;
  try {
    parsed = parseQueryValue(proposal.code);
  } catch (e) {
    return { state: "error", message: String(e) };
  }
  if (parsed === undefined) return { state: "error", message: `Empty ${proposal.kind}` };
  const started = performance.now();
  try {
    if (proposal.kind === "filter") {
      const count = await api.countDocuments(sessionId, database, collection, parsed);
      return { state: "done", count, capped: false, ms: Math.round(performance.now() - started) };
    }
    if (!Array.isArray(parsed)) return { state: "error", message: "A pipeline is an array of stages" };
    if (pipelineWrites(proposal.code)) return { state: "skipped", reason: "Not dry-run: it writes with $out or $merge" };
    const page = await api.runAggregate(sessionId, database, collection, [...parsed, { $limit: CAP + 1 }]);
    return {
      state: "done",
      count: Math.min(page.returned, CAP),
      capped: page.returned > CAP,
      ms: Math.round(performance.now() - started),
    };
  } catch (e) {
    return { state: "error", message: String(e) };
  }
}

/**
 * Runs a proposed filter (count) or pipeline (capped) once, read-only, so
 * the card can say what it returns before anything is applied.
 */
export function useDryRun(
  connectionId: string,
  database: string,
  collection: string | null,
  proposal: Proposal,
): DryRun | null {
  const sessionId = useConnectionsStore((s) => s.sessions[connectionId]?.sessionId);
  const [result, setResult] = useState<DryRun | null>(null);
  const skip = proposal.kind === "script" || !collection || !sessionId;

  useEffect(() => {
    if (skip) return;
    let live = true;
    const key = [sessionId, database, collection, proposal.kind, proposal.code].join("\u0000");
    let run = runs.get(key);
    if (!run) {
      run = dryRun(sessionId, database, collection, proposal);
      runs.set(key, run);
    }
    setResult({ state: "running" });
    void run.then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [skip, sessionId, database, collection, proposal]);

  return skip ? null : result;
}

export function dryRunText(run: DryRun, noun = "documents"): string {
  if (run.state === "running") return "Dry run…";
  if (run.state === "skipped") return run.reason;
  if (run.state === "error") return `Dry run failed: ${run.message}`;
  const n = `${run.count.toLocaleString("en")}${run.capped ? "+" : ""}`;
  return `Dry run: ${n} ${run.count === 1 && !run.capped ? noun.replace(/s$/, "") : noun} · ${run.ms} ms`;
}
