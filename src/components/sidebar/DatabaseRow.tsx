import { ChevronRight, Layers } from "lucide-react";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import type { TabConnection } from "../../store/sessionsStore";
import type { DatabaseInfo } from "../../types/connection";

// The active connection already paints its whole subtree bg-sidebar-active,
// so the open collection can't reuse that colour. A wash of the text colour
// stands out on any theme: it lightens dark ones and darkens the light one.
const activeRowClass = "rounded bg-text-default/15";

interface DatabaseRowProps {
  db: DatabaseInfo;
  sessionId: string;
  connection: TabConnection;
}

export function DatabaseRow({ db, sessionId, connection }: DatabaseRowProps) {
  const expandedDatabase = useSessionsStore((s) => s.expandedDatabase);
  const collections = useSessionsStore((s) => s.collections);
  const collectionsLoading = useSessionsStore((s) => s.collectionsLoading);
  const collectionsError = useSessionsStore((s) => s.collectionsError);
  // Strings, not the tab object, so typing in a query doesn't re-render the tree.
  const activeConnectionId = useSessionsStore(
    (s) => selectActiveTab(s)?.connection.id ?? null,
  );
  const activeDatabase = useSessionsStore((s) => selectActiveTab(s)?.database ?? null);
  const activeTabCollection = useSessionsStore(
    (s) => selectActiveTab(s)?.collection ?? null,
  );
  const toggleDatabase = useSessionsStore((s) => s.toggleDatabase);
  const openCollection = useSessionsStore((s) => s.openCollection);

  const isOpen = expandedDatabase === db.name;
  // Collapsing is only visual, so surface the active tab's collection on the
  // database row itself - otherwise it disappears from the sidebar.
  const activeCollection =
    activeConnectionId === connection.id && activeDatabase === db.name
      ? activeTabCollection
      : null;
  const showsActiveInline = !isOpen && activeCollection !== null;

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs text-text-default ${
          showsActiveInline ? activeRowClass : "hover:bg-sidebar-hover"
        }`}
        onClick={() => toggleDatabase(sessionId, db.name)}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        <Layers size={12} className="shrink-0 text-text-muted" />
        <span className={showsActiveInline ? "shrink-0" : "truncate"}>{db.name}</span>
        {showsActiveInline && (
          <span className="truncate text-[11px] text-text-muted">
            · {activeCollection}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="ml-4 border-l border-border-subtle/40 pl-2">
          {collectionsError ? (
            <p className="px-1.5 py-1 text-[11px] text-red-400">{collectionsError}</p>
          ) : collectionsLoading ? (
            <p className="px-1.5 py-1 text-[11px] text-text-faint">Loading…</p>
          ) : (
            collections.length === 0 && (
              <p className="px-1.5 py-1 text-[11px] text-text-faint">No collections</p>
            )
          )}
          {collections.map((coll) => (
            <button
              key={coll.name}
              type="button"
              className={`block w-full truncate px-1.5 py-1 text-left text-[11px] ${
                activeCollection === coll.name
                  ? `${activeRowClass} font-medium text-text-default`
                  : "text-text-muted hover:bg-sidebar-hover"
              }`}
              onClick={() => openCollection(sessionId, connection, db.name, coll.name)}
            >
              {coll.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
