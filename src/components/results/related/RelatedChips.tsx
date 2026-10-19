import { Funnel, Link, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { relatedColumnFilterLabel, relatedColumnTitle, type RelationEnd } from "../../../lib/relations";
import { useRelatedColumns, useRelatedStore } from "../../../store/relatedStore";

/**
 * A chip per Related column over the grid: clicking one shows only the rows
 * where it isn't 1 (or where the related document is missing), its x
 * removes the column.
 */
export function RelatedChips({ tabId, ends }: { tabId: string; ends: RelationEnd[] }) {
  const columns = useRelatedColumns(tabId);
  const only = useRelatedStore((s) => s.only[tabId] ?? null);
  const { removeColumn, toggleOnly } = useRelatedStore.getState();
  const shown = columns
    .map((col, index) => ({ col, index, end: ends.find((e) => e.relation.id === col.relationId && e.dir === col.dir) }))
    .filter((c): c is typeof c & { end: RelationEnd } => c.end !== undefined);
  if (shown.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-1.5 text-xs">
      {shown.map(({ col, index, end }) => {
        const on = only === index;
        const Icon = on ? Funnel : Link;
        return (
          <span
            key={col.id}
            className={cn(
              "inline-flex h-[22px] items-center gap-1 rounded-full pr-0.5 pl-[7px]",
              on ? "bg-warn/20 text-warn" : "bg-accent/12 text-accent-text",
            )}
          >
            <Icon aria-hidden className="size-3" />
            <button
              type="button"
              aria-pressed={on}
              title={on ? "Show every row" : "Show only the rows where this looks wrong"}
              className="text-xs outline-none focus-visible:underline"
              onClick={() => toggleOnly(tabId, index)}
            >
              {on ? relatedColumnFilterLabel(end.name, col) : relatedColumnTitle(end.name, col)}
            </button>
            <button
              type="button"
              aria-label="Remove column"
              title="Remove column"
              className={cn(
                "grid size-[18px] place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-ring",
                on ? "hover:bg-warn/25" : "hover:bg-accent/20",
              )}
              onClick={() => removeColumn(tabId, index)}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <span className="text-fg-3">
        Click a column to show only the rows where it isn't 1
        {shown.some((c) => c.col.kind === "exists") ? " (or where the document is missing)" : ""}.
      </span>
    </div>
  );
}
