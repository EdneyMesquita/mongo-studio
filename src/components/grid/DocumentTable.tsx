import { useCallback, useContext, useMemo, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { documentKey } from "../../lib/bsonFormat";
import { columnsOf } from "../../lib/documentColumns";
import { ValueEditContext } from "../json/ValueEditContext";
import { DocumentTableRow } from "./DocumentTableRow";
import { useScrollbarWidth } from "./useScrollbarWidth";

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

/** Fades the last 36px before the vertical scrollbar, leaving the scrollbar itself whole. */
function fadeMask(scrollbar: number): CSSProperties {
  const edge = `100% - ${scrollbar}px`;
  const mask = `linear-gradient(to right, black calc(${edge} - 36px), transparent calc(${edge} - 4px), transparent calc(${edge}), black calc(${edge}))`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/**
 * Documents as a grid: columns inferred from their fields, a sticky header
 * with each field's type, sticky row numbers. With `onSelect`, a click or
 * ArrowUp/ArrowDown selects a row. Scalar cells edit in place on
 * double-click under a ValueEditContext.
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

  const select = useCallback(
    (index: number) => {
      onSelect?.(index);
      scroller.current
        ?.querySelector(`tr[data-row="${index}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [onSelect],
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
    <div
      ref={scroller}
      tabIndex={onSelect ? 0 : undefined}
      className={cn("relative min-h-0 min-w-0 overflow-auto", className)}
      style={fadeRight ? fadeMask(scrollbar) : undefined}
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
          {documents.map((doc, i) => {
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
        </tbody>
      </table>
    </div>
  );
}
