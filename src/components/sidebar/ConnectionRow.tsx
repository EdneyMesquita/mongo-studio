import { useEffect, useState } from "react";
import { ChevronRight, Database, Trash2 } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { DatabaseRow } from "./DatabaseRow";
import type { ConnectionProfileMeta } from "../../types/connection";

export function ConnectionRow({ profile }: { profile: ConnectionProfileMeta }) {
  const session = useConnectionsStore((s) => s.session);
  const connect = useConnectionsStore((s) => s.connect);
  const deleteProfile = useConnectionsStore((s) => s.deleteProfile);
  const [expanded, setExpanded] = useState(false);

  const isActive = session?.connectionId === profile.id;

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  function handleToggle() {
    if (isActive) {
      setExpanded((e) => !e);
    } else {
      connect(profile.id);
    }
  }

  return (
    <div className={isActive ? "bg-sidebar-active" : ""}>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 text-sm ${
          isActive ? "hover:bg-sidebar-active-hover" : "hover:bg-sidebar-hover"
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={handleToggle}
        >
          <ChevronRight
            size={13}
            className={`shrink-0 text-text-faint transition-transform ${
              expanded && isActive ? "rotate-90" : ""
            }`}
          />
          <Database size={14} className="shrink-0 text-text-muted" />
          <span className="truncate text-text-default">{profile.name}</span>
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-green" />
          )}
        </button>
        <button
          type="button"
          className="hidden shrink-0 text-text-faint hover:text-red-400 group-hover:inline"
          onClick={() => deleteProfile(profile.id)}
          title="Delete connection"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {isActive && expanded && session && (
        <div className="ml-4 border-l border-border-subtle/60 pl-2">
          {session.databases.map((db) => (
            <DatabaseRow
              key={db.name}
              db={db}
              sessionId={session.sessionId}
              connection={{ id: profile.id, name: profile.name, summary: profile.summary }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
