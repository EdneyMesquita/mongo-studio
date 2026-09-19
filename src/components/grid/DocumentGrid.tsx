import { useState } from "react";
import { useSessionsStore } from "../../store/sessionsStore";
import { QueryBar } from "../query/QueryBar";
import { ExportDialog } from "../export/ExportDialog";

export function DocumentGrid() {
  const { selectedCollection, selectedDatabase, stats, results, error, loading } =
    useSessionsStore();
  const [exportOpen, setExportOpen] = useState(false);

  if (!selectedCollection || !selectedDatabase) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Select a collection to browse its documents
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <QueryBar />
      <div className="flex items-center justify-between border-b border-border-subtle bg-editor px-3 py-1.5 text-xs text-text-muted">
        <div className="flex items-center gap-3">
          <span className="font-mono text-text-default">
            {selectedDatabase}.{selectedCollection}
          </span>
          {stats && (
            <>
              <span>{stats.documentCount.toLocaleString()} documents</span>
              <span>{stats.indexes.length} indexes</span>
            </>
          )}
          {loading && <span>Loading…</span>}
          {results && <span>Showing {results.returned}</span>}
        </div>
        <button
          type="button"
          className="rounded border border-border-subtle px-2 py-1 text-text-default hover:bg-panel-hover"
          onClick={() => setExportOpen(true)}
        >
          Export CSV
        </button>
      </div>
      {error && (
        <div className="m-2 rounded bg-red-950 p-2 text-xs text-red-300">{error}</div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {results?.documents.length === 0 && (
          <p className="p-3 text-xs text-text-faint">No documents match this query.</p>
        )}
        <div className="flex flex-col gap-2">
          {results?.documents.map((doc, i) => (
            <pre
              key={i}
              className="overflow-x-auto rounded border border-border-subtle bg-panel p-2 text-xs text-text-default"
            >
              {JSON.stringify(doc, null, 2)}
            </pre>
          ))}
        </div>
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
