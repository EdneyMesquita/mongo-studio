import { useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { ChevronRight, Database, MoreHorizontal } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useConnectionsStore } from "../../store/connectionsStore";
import { DatabaseRow } from "./DatabaseRow";
import { ContextMenu } from "../ui/ContextMenu";
import type { ConnectionProfileMeta } from "../../types/connection";

interface ConnectionRowProps {
  profile: ConnectionProfileMeta;
  onEdit: (id: string) => void;
}

export function ConnectionRow({ profile, onEdit }: ConnectionRowProps) {
  const session = useConnectionsStore((s) => s.session);
  const connect = useConnectionsStore((s) => s.connect);
  const disconnect = useConnectionsStore((s) => s.disconnect);
  const deleteProfile = useConnectionsStore((s) => s.deleteProfile);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const isActive = session?.connectionId === profile.id;

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleDelete() {
    const confirmed = await ask(
      `Delete the connection "${profile.name}"? Its saved passwords are removed too.`,
      { title: "Delete connection", kind: "warning", okLabel: "Delete", cancelLabel: "Cancel" },
    );
    if (confirmed) await deleteProfile(profile.id);
  }

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
        onContextMenu={openMenu}
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
          className={`shrink-0 rounded text-text-faint hover:text-text-default focus:opacity-100 ${
            menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={openMenu}
          title="Connection actions"
          aria-label={`Actions for ${profile.name}`}
          aria-haspopup="menu"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            isActive
              ? { label: "Disconnect", onSelect: () => disconnect() }
              : { label: "Connect", onSelect: () => connect(profile.id) },
            { label: "Edit connection...", onSelect: () => onEdit(profile.id) },
            { label: "Delete connection...", onSelect: handleDelete },
          ]}
        />
      )}
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
