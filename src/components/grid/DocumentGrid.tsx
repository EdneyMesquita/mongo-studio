import { useSessionsStore } from "../../store/sessionsStore";
import { QueryBar } from "../query/QueryBar";

export function DocumentGrid() {
  const { selectedCollection, selectedDatabase, stats, results, error, loading } =
    useSessionsStore();

  if (!selectedCollection || !selectedDatabase) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Select a collection to browse its documents
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <QueryBar />
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
        <span className="font-mono text-neutral-300">
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
      {error && (
        <div className="m-2 rounded bg-red-950 p-2 text-xs text-red-300">{error}</div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {results?.documents.length === 0 && (
          <p className="p-3 text-xs text-neutral-600">No documents match this query.</p>
        )}
        <div className="flex flex-col gap-2">
          {results?.documents.map((doc, i) => (
            <pre
              key={i}
              className="overflow-x-auto rounded border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-300"
            >
              {JSON.stringify(doc, null, 2)}
            </pre>
          ))}
        </div>
      </div>
    </div>
  );
}
