import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPlainObject } from "../../lib/bsonValue";
import type { DocumentColumn } from "../../lib/documentColumns";
import { DocumentTableCell } from "./DocumentTableCell";

interface DocumentTableRowProps {
  doc: unknown;
  index: number;
  columns: DocumentColumn[];
  selected: boolean;
  /** Plays the saved-value flash on the row's cells. */
  flashing: boolean;
  /** Absent in a read-only grid, whose rows can't be selected. */
  onSelect?: (index: number) => void;
  /** Opens or closes the document under the row, in a pane too narrow for the inspector. */
  onToggle?: (index: number) => void;
  /** Whether its document is open under it. */
  expanded?: boolean;
}

/** One document as a grid row, with its sticky row number. */
export const DocumentTableRow = memo(function DocumentTableRow({
  doc,
  index,
  columns,
  selected,
  flashing,
  onSelect,
  onToggle,
  expanded = false,
}: DocumentTableRowProps) {
  const fields = isPlainObject(doc) ? doc : {};
  const cellBg = selected ? "bg-sel-soft" : "group-hover/row:bg-row-hover";
  return (
    <tr
      data-row={index}
      aria-rowindex={index + 2}
      aria-selected={onSelect ? selected : undefined}
      aria-expanded={onToggle ? expanded : undefined}
      className={cn("group/row scroll-mt-[30px]", onSelect && "cursor-pointer", flashing && "*:animate-flash")}
      onClick={
        onSelect
          ? (e) => {
              onSelect(index);
              // Only the first click of a double-click, which edits a value.
              if (e.detail <= 1) onToggle?.(index);
            }
          : undefined
      }
    >
      <td
        className={cn(
          "sticky left-0 z-[1] h-6 w-11 min-w-11 border-r border-b border-line-soft px-2 text-right",
          onToggle && "cursor-pointer pl-1",
          selected ? "bg-sel-soft text-fg" : "bg-editor text-fg-3 group-hover/row:bg-row-hover",
          expanded && "border-b-transparent",
        )}
        title={onToggle ? (expanded ? "Close the document" : "Open the whole document under this row") : undefined}
      >
        {onToggle && (
          <ChevronRight
            aria-hidden
            className={cn(
              "mr-0.5 inline size-3 align-[-2px] text-fg-3 transition-[transform,opacity] duration-150",
              expanded ? "rotate-90 text-fg opacity-100" : "opacity-0 group-hover/row:opacity-100",
              selected && "opacity-100",
            )}
          />
        )}
        {index + 1}
      </td>
      {columns.map(({ key }) => (
        <DocumentTableCell key={key} doc={doc} field={key} value={fields[key]} className={cellBg} />
      ))}
    </tr>
  );
});
