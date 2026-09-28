import { useCallback, useContext, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { documentKey } from "../../lib/bsonFormat";
import { columnsOf } from "../../lib/documentColumns";
import { ValueEditContext } from "../json/ValueEditContext";
import { DocumentTableRow } from "./DocumentTableRow";
import { useScrollbarWidth } from "./useScrollbarWidth";
import { useVirtualRows } from "./useVirtualRows";

const HEADER_HEIGHT = 30;

interface DocumentTableProps {
  documents: unknown[];
  /** Selection, for a grid beside an inspector; without `onSelect` rows can't be selected. */
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
  /** Fade the right edge where the grid meets a panel beside it. */
  fadeRight?: boolean;
  "aria-label": string;
  className?: string;
}

/**
 * Documents as a grid: columns inferred from their fields, a sticky header
 * with each field's type, sticky row numbers. With `onSelect`, a click or
 * ArrowUp/ArrowDown selects a row. Scalar cells edit in place on
 * double-click under a ValueEditContext. Large results render only the rows
 * in view (useVirtualRows), so a 2000-document page scrolls like a small one.
 */
export function DocumentTable({
  documents,
  selectedIndex = null,
  onSelect,
  fadeRight = false,
  className,
  ...aria
}: DocumentTableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollbar = useScrollbarWidth(scroller);
  const columns = useMemo(() => columnsOf(documents), [documents]);
  const saved = useContext(ValueEditContext)?.saved ?? null;
  const rows = useVirtualRows(scroller, documents.length, HEADER_HEIGHT);
  const { reveal } = rows;

  const select = useCallback(
    (index: number) => {
      onSelect?.(index);
      reveal(index);
    },
    [onSelect, reveal],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect || documents.length === 0) return;
    const last = documents.length - 1;
    const current = selectedIndex ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(last, current + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, current - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div className={cn("relative flex min-h-0 min-w-0", className)}>
    <div
      ref={scroller}
      tabIndex={onSelect ? 0 : undefined}
      className="relative min-h-0 min-w-0 flex-1 overflow-auto"
      onKeyDown={onKeyDown}
    >
      <table
        role="grid"
        aria-label={aria["aria-label"]}
        aria-rowcount={documents.length + 1}
        className="min-w-full border-separate border-spacing-0 font-data"
      >
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-[3] h-[30px] w-11 min-w-11 border-r border-b border-r-line-soft border-b-line bg-panel px-2 text-right font-sans text-sm font-medium text-fg-3"
            >
              #
            </th>
            {columns.map(({ key, type }) => (
              <th
                key={key}
                scope="col"
                title={`${key}: ${type}`}
                className="sticky top-0 z-[2] h-[30px] max-w-[280px] overflow-hidden border-r border-b border-r-line-soft border-b-line bg-panel px-2.5 text-left font-sans text-sm font-medium text-ellipsis whitespace-nowrap text-fg"
              >
                {key}
                <span className="ml-1.5 font-mono text-2xs font-normal text-fg-3">{type}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.padTop > 0 && (
            <tr aria-hidden style={{ height: rows.padTop }}>
              <td colSpan={columns.length + 1} className="p-0" />
            </tr>
          )}
          {documents.slice(rows.start, rows.end).map((doc, offset) => {
            const i = rows.start + offset;
            const flashing = saved !== null && saved.docKey === documentKey(doc);
            return (
              <DocumentTableRow
                // keyed by the save while flashing, so each save restarts it
                key={flashing ? `${i}:${saved.at}` : i}
                doc={doc}
                index={i}
                columns={columns}
                selected={i === selectedIndex}
                flashing={flashing}
                onSelect={onSelect ? select : undefined}
              />
            );
          })}
          {rows.padBottom > 0 && (
            <tr aria-hidden style={{ height: rows.padBottom }}>
              <td colSpan={columns.length + 1} className="p-0" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
      {/* Where the grid meets a panel beside it, its right edge fades out
          (an overlay: a CSS mask made every scroll frame repaint the table). */}
      {fadeRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-9 bg-linear-to-r from-transparent to-editor"
          style={{ right: scrollbar }}
        />
      )}
    </div>
  );
}
