import type { Tab } from "../../store/sessionsStore";

/** What a tab is called: its namespace, or for a console its database. */
export function tabName(tab: Tab): string {
  if (tab.kind === "collection") return `${tab.database}.${tab.collection}`;
  return `${tab.database} console${tab.number > 1 ? ` ${tab.number}` : ""}`;
}
