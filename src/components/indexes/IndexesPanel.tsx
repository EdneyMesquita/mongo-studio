import { useConnectionsStore } from "../../store/connectionsStore";
import type { CollectionTab } from "../../store/sessionsStore";
import { useIndexStats } from "./useIndexStats";
import { IndexRow } from "./IndexRow";

const columns = ["Name", "Keys", "Properties", "Usage", "Since"];

/**
 * A collection's indexes: keys, properties and how often each was used
 * since the server started (`$indexStats`, which may be refused).
 */
export function IndexesPanel({ tab }: { tab: CollectionTab }) {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);
  const { database, collection, stats } = tab;
  const { usageByName, loading, error } = useIndexStats(session?.sessionId, database, collection);
  const indexes = stats?.indexes ?? [];
  const maxOps = Math.max(0, ...[...usageByName.values()].map((u) => u.ops ?? 0));

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex h-[34px] flex-none items-center gap-3 border-b border-line pr-2.5 pl-3 text-sm text-fg-2">
        <span className="truncate">
          <span className="font-medium text-fg tabular-nums">{indexes.length}</span>{" "}
          {indexes.length === 1 ? "index" : "indexes"} on{" "}
          <span className="font-data text-fg">
            {database}.{collection}
          </span>
        </span>
        <span className="flex-1" />
        <span className="shrink-0 text-xs text-fg-3 max-sm:hidden">
          {loading ? "Loading usage stats…" : "Usage since the server last started"}
        </span>
      </div>
      {error && (
        <p className="flex-none border-b border-line-soft px-3 py-1.5 text-xs text-warn">
          Index usage stats unavailable: {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="sticky top-0 h-[30px] border-b border-line-soft bg-panel px-3.5 text-sm font-medium whitespace-nowrap text-fg-2"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indexes.map((index) => (
              <IndexRow
                key={index.name}
                index={index}
                usage={usageByName.get(index.name)}
                maxOps={maxOps}
              />
            ))}
          </tbody>
        </table>
        {indexes.length === 0 && <p className="px-3.5 py-3 text-sm text-fg-3">No indexes.</p>}
      </div>
    </div>
  );
}
