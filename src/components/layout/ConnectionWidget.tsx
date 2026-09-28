import { Check, ChevronDown, Plug, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { connectionColor } from "../../lib/connectionColor";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { lastTabOf } from "./lastTabs";
import type { ActiveConnection } from "./useActiveConnection";

interface ConnectionWidgetProps {
  active: ActiveConnection | null;
}

/**
 * The toolbar's connection switcher: the active tab's connection, and a
 * menu of every open one to jump to, or to connect or add another.
 */
export function ConnectionWidget({ active }: ConnectionWidgetProps) {
  const sessions = useConnectionsStore((s) => s.sessions);
  const profiles = useConnectionsStore((s) => s.profiles);
  const setSidePanel = useUiStore((s) => s.setSidePanel);
  const setConnectionDialog = useUiStore((s) => s.setConnectionDialog);
  const open = profiles.filter((p) => sessions[p.id]);

  function jumpTo(connectionId: string) {
    const tabId = lastTabOf(connectionId);
    if (tabId) useSessionsStore.getState().activateTab(tabId);
    // nothing open on it yet: its tree is where to pick something
    else setSidePanel("explorer");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 px-2 font-medium text-fg">
          {active ? (
            <>
              <ConnectionChip name={active.tab.connection.name} color={active.color} size="md" />
              <span className="truncate">{active.tab.connection.name}</span>
            </>
          ) : (
            <span className="font-normal text-fg-2">
              {open.length > 0 ? `${open.length} connected` : "No connection"}
            </span>
          )}
          <ChevronDown className="size-3 text-fg-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {open.length > 0 && (
          <>
            <DropdownMenuLabel>Open connections</DropdownMenuLabel>
            {open.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => jumpTo(p.id)}>
                <ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} />
                <span className="truncate">{p.name}</span>
                {active?.tab.connection.id === p.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => setSidePanel("explorer")}>
          <Plug />
          Connect another server…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setConnectionDialog({ mode: "new" })}>
          <Plus />
          New connection…
          <DropdownMenuShortcut>Ctrl N</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
