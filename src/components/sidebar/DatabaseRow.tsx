import { ChevronRight, Layers } from "lucide-react";
import { useSessionsStore } from "../../store/sessionsStore";
import type { DatabaseInfo } from "../../types/connection";

export function DatabaseRow({ db, sessionId }: { db: DatabaseInfo; sessionId: string }) {
  const {
    expandedDatabase,
    selectedDatabase,
    selectedCollection,
    collections,
    toggleDatabase,
    selectCollection,
  } = useSessionsStore();
  const isOpen = expandedDatabase === db.name;
  // Collapsing is only visual, so surface the collection still being browsed
  // on the database row itself - otherwise it disappears from the sidebar.
  const activeCollection =
    selectedDatabase === db.name ? selectedCollection : null;
  const showsActiveInline = !isOpen && activeCollection !== null;

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs text-text-default ${
          showsActiveInline
            ? "bg-sidebar-active hover:bg-sidebar-active-hover"
            : "hover:bg-sidebar-hover"
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
          {collections.length === 0 && (
            <p className="px-1.5 py-1 text-[11px] text-text-faint">No collections</p>
          )}
          {collections.map((coll) => (
            <button
              key={coll.name}
              type="button"
              className={`block w-full truncate px-1.5 py-1 text-left text-[11px] ${
                selectedCollection === coll.name
                  ? "bg-sidebar-active font-medium text-text-default hover:bg-sidebar-active-hover"
                  : "text-text-muted hover:bg-sidebar-hover"
              }`}
              onClick={() => selectCollection(sessionId, db.name, coll.name)}
            >
              {coll.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
