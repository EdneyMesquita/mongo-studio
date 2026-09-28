import { Database, Moon, Plus, SquareTerminal, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { useThemeStore } from "../../store/themeStore";
import { useUiStore } from "../../store/uiStore";
import { HighlightMatch } from "./HighlightMatch";

interface PaletteActionsProps {
  search: string;
  /** Closes the palette, then runs the choice. */
  run: (action: () => void) => void;
}

interface PaletteAction {
  id: string;
  icon: ReactNode;
  label: string;
  where?: string;
  shortcut?: string;
  perform: () => void;
}

/** The palette's commands. */
export function PaletteActions({ search, run }: PaletteActionsProps) {
  const activeTab = useSessionsStore(selectActiveTab);
  const themeId = useThemeStore((s) => s.themeId);

  const actions: PaletteAction[] = [
    {
      id: "new-connection",
      icon: <Plus />,
      label: "New connection",
      shortcut: "Ctrl N",
      perform: () => useUiStore.getState().setConnectionDialog({ mode: "new" }),
    },
  ];
  if (activeTab) {
    const tab = activeTab;
    actions.push({
      id: "new-console",
      icon: <SquareTerminal />,
      label: `New console on ${tab.database}`,
      where: tab.connection.name,
      perform: () =>
        useSessionsStore
          .getState()
          .openConsole(tab.connection, tab.database, tab.kind === "collection" ? tab.collection : null),
    });
  }
  const other = themeId === "dark" ? "light" : "dark";
  actions.push(
    {
      id: "theme",
      icon: other === "light" ? <Sun /> : <Moon />,
      label: `Switch to ${other} theme`,
      perform: () => useThemeStore.getState().setTheme(other),
    },
    {
      id: "toggle-explorer",
      icon: <Database />,
      label: "Toggle Explorer",
      shortcut: "Ctrl B",
      perform: () => useUiStore.getState().toggleSidePanel("explorer"),
    },
  );

  return (
    <CommandGroup heading="Actions">
      {actions.map((action) => (
        <CommandItem
          key={action.id}
          value={`action:${action.id}`}
          keywords={[action.label]}
          onSelect={() => run(action.perform)}
        >
          {action.icon}
          <span className="min-w-0 truncate">
            <HighlightMatch text={action.label} query={search} />
          </span>
          {action.where && <span className="shrink-0 text-sm text-fg-3">{action.where}</span>}
          {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
