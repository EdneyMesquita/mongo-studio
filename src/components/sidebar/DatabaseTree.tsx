import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";

export function DatabaseTree() {
  const { session, disconnect } = useConnectionsStore();
  const {
    collections,
    selectedDatabase,
    selectedCollection,
    selectDatabase,
    selectCollection,
  } = useSessionsStore();

  if (!session) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle p-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-text-default">Connected</p>
          {session.serverVersion && (
            <p className="text-[10px] text-text-faint">MongoDB {session.serverVersion}</p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 rounded bg-panel-alt px-2 py-1 text-xs text-text-default hover:bg-panel-hover"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>

      <div className="flex-1 overflow-y-auto text-sm">
        {session.databases.map((db) => {
          const isOpen = selectedDatabase === db.name;
          return (
            <div key={db.name}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-panel ${
                  isOpen ? "bg-panel text-text-default" : "text-text-default"
                }`}
                onClick={() => selectDatabase(session.sessionId, db.name)}
              >
                <span className="truncate">{db.name}</span>
              </button>
              {isOpen && (
                <div className="ml-3 border-l border-border-subtle pl-2">
                  {collections.length === 0 && (
                    <p className="px-2 py-1 text-xs text-text-faint">No collections</p>
                  )}
                  {collections.map((coll) => (
                    <button
                      key={coll.name}
                      type="button"
                      className={`block w-full truncate px-2 py-1 text-left text-xs hover:bg-panel ${
                        selectedCollection === coll.name
                          ? "bg-panel-alt text-white"
                          : "text-text-muted"
                      }`}
                      onClick={() =>
                        selectCollection(session.sessionId, db.name, coll.name)
                      }
                    >
                      {coll.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
