import { X } from "lucide-react";
import { useSessionsStore } from "../../store/sessionsStore";
import type { MenuEntry } from "@/components/common/ActionMenu";
import { EditorTab } from "./EditorTab";

/** Open collections and consoles, across every database of every connection. */
export function CollectionTabs() {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const closeOtherTabs = useSessionsStore((s) => s.closeOtherTabs);
  const closeAllTabs = useSessionsStore((s) => s.closeAllTabs);

  if (tabs.length === 0) return null;

  const menuFor = (tabId: string) => (): MenuEntry[] => [
    { label: "Close tab", icon: X, onSelect: () => closeTab(tabId) },
    {
      label: "Close other tabs",
      onSelect: () => closeOtherTabs(tabId),
      disabled: tabs.length < 2,
    },
    { label: "Close all tabs", onSelect: closeAllTabs },
  ];

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      // No visible scrollbar - it would squeeze the labels - so a plain mouse
      // wheel scrolls the strip sideways instead, like editor tab bars.
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-editor scrollbar-none"
      onWheel={(e) => {
        if (e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {tabs.map((tab) => (
        <EditorTab
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          entries={menuFor(tab.id)}
        />
      ))}
    </div>
  );
}
