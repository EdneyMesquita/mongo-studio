import { useState } from "react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { QueryMode } from "../../store/sessionsStore";
import { ExplainDialog } from "../explain/ExplainDialog";

const inputClass =
  "rounded border border-border-subtle bg-panel px-2 py-1 text-xs text-text-default focus:border-accent focus:outline-none";

const modes: { id: QueryMode; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "aggregate", label: "Aggregate" },
];

export function QueryBar() {
  const session = useConnectionsStore((s) => s.session);
  const {
    mode,
    filterText,
    sortText,
    limit,
    skip,
    pipelineText,
    loading,
    setMode,
    setFilterText,
    setSortText,
    setLimit,
    setSkip,
    setPipelineText,
    runQuery,
  } = useSessionsStore();
  const [explainOpen, setExplainOpen] = useState(false);

  if (!session) return null;

  return (
    <div className="border-b border-border-subtle bg-editor">
      <div className="flex gap-1 px-2 pt-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`rounded-t px-2.5 py-1 text-[11px] ${
              mode === m.id
                ? "bg-panel text-text-default"
                : "text-text-muted hover:text-text-default"
            }`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 bg-panel p-2">
        {mode === "find" ? (
          <>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
                Filter (JSON)
              </label>
              <input
                className={`${inputClass} w-full font-mono`}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="{ }"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
                Sort (JSON)
              </label>
              <input
                className={`${inputClass} w-full font-mono`}
                value={sortText}
                onChange={(e) => setSortText(e.target.value)}
                placeholder="{ _id: -1 }"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
                Limit
              </label>
              <input
                type="number"
                className={`${inputClass} w-20`}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
                Skip
              </label>
              <input
                type="number"
                className={`${inputClass} w-20`}
                value={skip}
                onChange={(e) => setSkip(Number(e.target.value))}
              />
            </div>
          </>
        ) : (
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
              Pipeline (JSON array of stages)
            </label>
            <textarea
              className={`${inputClass} h-20 w-full resize-y font-mono`}
              value={pipelineText}
              onChange={(e) => setPipelineText(e.target.value)}
              placeholder='[ { "$match": {} }, { "$limit": 50 } ]'
            />
          </div>
        )}
        <button
          type="button"
          disabled={loading}
          className="rounded bg-run px-3 py-1.5 text-xs text-white hover:bg-run-hover disabled:opacity-50"
          onClick={() => runQuery(session.sessionId)}
        >
          Run
        </button>
        <button
          type="button"
          className="rounded border border-border-subtle px-3 py-1.5 text-xs text-text-default hover:bg-panel-hover"
          onClick={() => setExplainOpen(true)}
        >
          Explain
        </button>
      </div>
      {explainOpen && <ExplainDialog onClose={() => setExplainOpen(false)} />}
    </div>
  );
}
