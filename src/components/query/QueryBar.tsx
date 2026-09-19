import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";

const inputClass =
  "rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-neutral-500 focus:outline-none";

export function QueryBar() {
  const session = useConnectionsStore((s) => s.session);
  const {
    filterText,
    sortText,
    limit,
    skip,
    loading,
    setFilterText,
    setSortText,
    setLimit,
    setSkip,
    runQuery,
  } = useSessionsStore();

  if (!session) return null;

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-neutral-800 bg-neutral-950 p-2">
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-[10px] text-neutral-500">Filter (JSON)</label>
        <input
          className={`${inputClass} w-full font-mono`}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="{ }"
        />
      </div>
      <div className="min-w-[140px]">
        <label className="mb-1 block text-[10px] text-neutral-500">Sort (JSON)</label>
        <input
          className={`${inputClass} w-full font-mono`}
          value={sortText}
          onChange={(e) => setSortText(e.target.value)}
          placeholder="{ _id: -1 }"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-neutral-500">Limit</label>
        <input
          type="number"
          className={`${inputClass} w-20`}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] text-neutral-500">Skip</label>
        <input
          type="number"
          className={`${inputClass} w-20`}
          value={skip}
          onChange={(e) => setSkip(Number(e.target.value))}
        />
      </div>
      <button
        type="button"
        disabled={loading}
        className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
        onClick={() => runQuery(session.sessionId)}
      >
        Run
      </button>
    </div>
  );
}
