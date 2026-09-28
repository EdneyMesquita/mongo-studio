import type { ReactNode } from "react";
import type { ExplainSummary } from "../../lib/explain";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-2">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** The winning plan at a glance: stages, the index it used, and the counts. */
export function ExplainSummaryView({ summary }: { summary: ExplainSummary }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-md border border-line bg-panel px-3 py-2.5 text-sm">
      <Row label="Plan">
        <span className="font-data text-fg">
          {summary.stages.length > 0 ? summary.stages.join(" → ") : "unknown"}
        </span>
      </Row>
      <Row label="Index used">
        {summary.usesCollectionScan ? (
          <span className="text-warn">none - full collection scan (COLLSCAN)</span>
        ) : (
          <span className="font-data text-ok">{summary.indexName ?? "unknown"}</span>
        )}
      </Row>
      {summary.executionTimeMillis !== null && (
        <Row label="Execution">
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-fg-2 tabular-nums">
            <span>returned: {summary.nReturned}</span>
            <span>keys examined: {summary.totalKeysExamined}</span>
            <span>docs examined: {summary.totalDocsExamined}</span>
            <span>time: {summary.executionTimeMillis}ms</span>
          </span>
        </Row>
      )}
    </dl>
  );
}
