import { Link2, SquareTerminal, Table2, type LucideIcon } from "lucide-react";
import type { Tab } from "../../store/sessionsStore";
import { useRelationsStore } from "../../store/relationsStore";

/** What a tab is called: its namespace, for a console its database, for a relation its name. */
export function tabName(tab: Tab): string {
  if (tab.kind === "collection") return `${tab.database}.${tab.collection}`;
  if (tab.kind === "relation") {
    return useRelationsStore.getState().relations.find((r) => r.id === tab.relationId)?.name || "New relation";
  }
  return `${tab.database} console${tab.number > 1 ? ` ${tab.number}` : ""}`;
}

/** A tab's icon in lists and placeholders. */
export function tabIcon(tab: Tab): LucideIcon {
  return tab.kind === "console" ? SquareTerminal : tab.kind === "relation" ? Link2 : Table2;
}
