import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { useSessionsStore } from "../../store/sessionsStore";
import type { CollectionTab } from "../../store/sessionsStore";

function TabButton({ tab, active }: { tab: CollectionTab; active: boolean }) {
  const activateTab = useSessionsStore((s) => s.activateTab);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const ref = useRef<HTMLDivElement>(null);

  // A tab opened from the sidebar may land past the strip's visible edge.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={`${tab.database}.${tab.collection}`}
      className={`group flex max-w-[240px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-t-2 border-r-border-subtle py-1.5 pl-3 pr-1.5 text-xs ${
        active
          ? "border-t-accent bg-editor text-text-default"
          : "border-t-transparent text-text-muted hover:bg-panel-hover hover:text-text-default"
      }`}
      onClick={() => activateTab(tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateTab(tab.id);
        }
      }}
      // Middle-click closes, as in a browser. Swallow the mousedown too, or
      // it starts autoscroll on Linux/Windows.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) closeTab(tab.id);
      }}
    >
      {tab.loading && (
        <Loader2 size={11} className="shrink-0 animate-spin text-text-faint" />
      )}
      <span className="truncate">
        <span className="text-text-faint">{tab.database}.</span>
        {tab.collection}
      </span>
      <button
        type="button"
        aria-label={`Close ${tab.database}.${tab.collection}`}
        title="Close (middle-click)"
        className={`shrink-0 rounded p-0.5 text-text-faint hover:bg-panel-alt hover:text-text-default focus:opacity-100 ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.id);
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** One tab per open collection, across every database of the connection. */
export function CollectionTabs() {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);

  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open collections"
      // No visible scrollbar - it would squeeze the labels - so a plain mouse
      // wheel scrolls the strip sideways instead, like editor tab bars.
      className="flex shrink-0 overflow-x-auto border-b border-border-subtle bg-sidebar scrollbar-none"
      onWheel={(e) => {
        if (e.deltaX === 0) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {tabs.map((tab) => (
        <TabButton key={tab.id} tab={tab} active={tab.id === activeTabId} />
      ))}
    </div>
  );
}
