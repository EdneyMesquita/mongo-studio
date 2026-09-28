import { useCallback, useEffect, useState } from "react";
import { ChevronDown, SquareTerminal, Table2, X } from "lucide-react";
import { ActionMenuButton } from "@/components/common/ActionMenu";
import { Button } from "@/components/ui/button";
import { tabName } from "./tabName";
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
  const activateTab = useSessionsStore((s) => s.activateTab);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  // Tabs past the strip's edge are listed in a menu at its end.
  const measure = useCallback(() => {
    if (strip) setOverflowing(strip.scrollWidth > strip.clientWidth + 1);
  }, [strip]);
  useEffect(() => {
    if (!strip) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [strip, measure, tabs]);
  // The active tab scrolls into view, e.g. one opened from the Assistant.
  useEffect(() => {
    strip?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [strip, activeTabId]);

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
    <div className="flex h-9 shrink-0 border-b border-line bg-editor">
    <div
      ref={setStrip}
      role="tablist"
      aria-label="Open tabs"
      // No visible scrollbar - it would squeeze the labels - so a plain mouse
      // wheel scrolls the strip sideways instead, like editor tab bars.
      className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-none"
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
    {overflowing && (
      <ActionMenuButton
        label="All open tabs"
        align="end"
        entries={() => [
          { heading: "Open tabs" },
          ...tabs.map((t) => ({
            label: `${tabName(t)} · ${t.connection.name}`,
            icon: t.kind === "console" ? SquareTerminal : Table2,
            onSelect: () => activateTab(t.id),
          })),
        ]}
        trigger={
          <Button variant="ghost" size="icon" title="All open tabs" aria-label="All open tabs" className="h-full w-8 rounded-none border-l border-line-soft">
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
    )}
    </div>
  );
}
