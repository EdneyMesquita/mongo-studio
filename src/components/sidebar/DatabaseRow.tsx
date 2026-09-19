import { ChevronRight, Layers } from "lucide-react";
import { useSessionsStore } from "../../store/sessionsStore";
import type { DatabaseInfo } from "../../types/connection";

export function DatabaseRow({ db, sessionId }: { db: DatabaseInfo; sessionId: string }) {
  const { selectedDatabase, selectedCollection, collections, selectDatabase, selectCollection } =
    useSessionsStore();
  const isOpen = selectedDatabase === db.name;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs text-text-default hover:bg-sidebar-hover"
        onClick={() => selectDatabase(sessionId, db.name)}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 text-text-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        <Layers size={12} className="shrink-0 text-text-muted" />
        <span className="truncate">{db.name}</span>
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
              className={`block w-full truncate px-1.5 py-1 text-left text-[11px] hover:bg-sidebar-hover ${
                selectedCollection === coll.name
                  ? "font-medium text-white"
                  : "text-text-muted"
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
