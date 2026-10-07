import { Copy, FolderPlus, Pencil, Plug, SquareTerminal, Table, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import type { MenuEntry } from "@/components/common/ActionMenu";

/** Copies a name for pasting into a query or a script. */
function copyName(name: string) {
  navigator.clipboard.writeText(name).then(
    () => toast.success(`Copied ${name}`),
    (e) => toast.error("Couldn't copy the name", { description: String(e) }),
  );
}

interface FolderMenu {
  hasConnections: boolean;
  /** How many connections in the folder, at any depth, are connected. */
  connectedCount: number;
  onNewFolder: () => void;
  onRename: () => void;
  onDisconnectAll: () => void;
  onDelete: () => void;
}

export function folderMenuEntries(m: FolderMenu): MenuEntry[] {
  return [
    { label: "New folder inside", icon: FolderPlus, onSelect: m.onNewFolder },
    { label: "Rename folder", icon: Pencil, onSelect: m.onRename },
    ...(m.connectedCount > 0
      ? [
          { separator: true } as const,
          {
            label: m.connectedCount === 1 ? "Disconnect 1 connection" : `Disconnect all ${m.connectedCount} connections`,
            icon: Unplug,
            onSelect: m.onDisconnectAll,
          },
        ]
      : []),
    { separator: true },
    {
      label: m.hasConnections ? "Delete folder (move its connections out first)" : "Delete folder",
      icon: Trash2,
      danger: true,
      disabled: m.hasConnections,
      onSelect: m.onDelete,
    },
  ];
}

interface ConnectionMenu {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function connectionMenuEntries(m: ConnectionMenu): MenuEntry[] {
  return [
    m.connected
      ? { label: "Disconnect", icon: Unplug, onSelect: m.onDisconnect }
      : { label: "Connect", icon: Plug, onSelect: m.onConnect },
    { label: "Edit connection...", icon: Pencil, onSelect: m.onEdit },
    { separator: true },
    { label: "Delete connection...", icon: Trash2, danger: true, onSelect: m.onDelete },
  ];
}

interface DatabaseMenu {
  database: string;
  connectionName: string;
  onOpenConsole: () => void;
}

export function databaseMenuEntries(m: DatabaseMenu): MenuEntry[] {
  return [
    { heading: `${m.database} on ${m.connectionName}` },
    { label: `Open console on ${m.database}`, icon: SquareTerminal, onSelect: m.onOpenConsole },
    { label: "Copy name", icon: Copy, onSelect: () => copyName(m.database) },
  ];
}

interface CollectionMenu {
  database: string;
  collection: string;
  onOpen: () => void;
  onOpenConsole: () => void;
}

export function collectionMenuEntries(m: CollectionMenu): MenuEntry[] {
  return [
    { heading: `${m.database}.${m.collection}` },
    { label: "Open collection", icon: Table, shortcut: "Enter", onSelect: m.onOpen },
    { label: `Open console on ${m.database}`, icon: SquareTerminal, onSelect: m.onOpenConsole },
    { label: "Copy name", icon: Copy, onSelect: () => copyName(m.collection) },
  ];
}
