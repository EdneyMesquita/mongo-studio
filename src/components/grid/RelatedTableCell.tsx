import { cn } from "@/lib/utils";
import { valueTitle } from "../../lib/bsonFormat";
import type { RelatedColumn } from "../../lib/relations";
import { isOddRelated, numberOf } from "../../lib/relatedView";
import { BsonCell } from "./BsonCell";

/** A Related cell's aggregate, or why there's none yet. */
export interface RelatedCellData {
  state: "loading" | "ready" | "off" | "error";
  value?: unknown;
}

/** A Related column's header and its cells' data, row by row. */
export interface RelatedGrid {
  columns: RelatedColumn[];
  titles: string[];
  /** Per shown row, one per column. */
  cells: RelatedCellData[][];
  /** The footer per column, over the rows shown. */
  totals: (string | null)[];
  /** The footer's label, e.g. "3 berlin_orders of 50 on this page". */
  footer: string;
  footerNote?: string;
}

/** The type tag under a Related column's title. */
export function relatedTypeTag(col: RelatedColumn): string {
  return col.kind === "exists" ? "Boolean" : col.kind === "count" ? "Int32" : col.kind === "sum" ? "Number" : "";
}

function Value({ col, value }: { col: RelatedColumn; value: unknown }) {
  switch (col.kind) {
    case "exists":
      return value === true ? (
        <span className="text-json-keyword">yes</span>
      ) : (
        <span className="text-fg-3 italic">missing</span>
      );
    case "first":
      return value === null || value === undefined ? <span className="text-fg-3 italic">null</span> : <BsonCell value={value} />;
    default: {
      const n = numberOf(value);
      return <span className="text-json-number">{n === null ? "" : n.toLocaleString("en")}</span>;
    }
  }
}

/** A Related column's cell: the aggregate, tinted; warn-tinted where it looks wrong. */
export function RelatedTableCell({ col, data, className }: { col: RelatedColumn; data: RelatedCellData | undefined; className: string }) {
  const ready = data?.state === "ready";
  const odd = ready && isOddRelated(col, data.value);
  return (
    <td
      className={cn(
        "h-6 max-w-[280px] overflow-hidden border-r border-b border-line-soft px-2.5 text-ellipsis whitespace-nowrap",
        col.kind === "first" ? "text-left" : "text-right",
        // the row's selection and hover show over the tint, not over a warning
        odd
          ? "bg-warn/13 [&_.italic]:font-semibold [&_.italic]:text-warn [&_.text-json-number]:font-semibold [&_.text-json-number]:text-warn"
          : cn("bg-accent/4", className),
      )}
      title={ready && data.value !== undefined ? valueTitle(data.value) : undefined}
    >
      {ready ? <Value col={col} value={data.value} /> : data?.state === "loading" ? <span className="text-fg-3">…</span> : null}
    </td>
  );
}
