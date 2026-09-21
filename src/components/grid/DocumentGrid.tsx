import { useState } from "react";
import { useSessionsStore } from "../../store/sessionsStore";
import { QueryBar } from "../query/QueryBar";
import { ExportDialog } from "../export/ExportDialog";
import { DocumentCard } from "./DocumentCard";
import { DocumentActions } from "./DocumentActions";
import { JsonTable } from "../json/JsonTable";
import { ResultViewToggle } from "../json/ResultViewToggle";
import { useUiStore } from "../../store/uiStore";

export function DocumentGrid() {
  const { selectedCollection, selectedDatabase, stats, results, error, loading } =
    useSessionsStore();
  const [exportOpen, setExportOpen] = useState(false);
  const resultView = useUiStore((s) => s.resultView);

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
        <div className="flex items-center gap-2">
          <ResultViewToggle />
          <button
            type="button"
            className="rounded border border-border-subtle px-2 py-1 text-text-default hover:bg-panel-hover"
            onClick={() => setExportOpen(true)}
          >
            Export CSV
          </button>
        </div>
      </div>
      {error && (
        <div className="m-2 rounded bg-red-950 p-2 text-xs text-red-300">{error}</div>
      )}
      <div className="flex-1 overflow-y-auto">
        {results?.documents.length === 0 && (
          <p className="p-3 text-xs text-text-faint">No documents match this query.</p>
        )}
        {resultView === "table" ? (
          results &&
          results.documents.length > 0 && (
            <JsonTable
              value={results.documents}
              rootActions={(doc) => (
                <DocumentActions doc={doc} collectionName={selectedCollection} />
              )}
            />
          )
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {results?.documents.map((doc, i) => (
              <DocumentCard key={i} doc={doc} collectionName={selectedCollection} />
            ))}
          </div>
        )}
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
