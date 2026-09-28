import { memo } from "react";
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
}

/** One document as a grid row, with its sticky row number. */
export const DocumentTableRow = memo(function DocumentTableRow({
  doc,
  index,
  columns,
  selected,
  flashing,
  onSelect,
}: DocumentTableRowProps) {
  const fields = isPlainObject(doc) ? doc : {};
  const cellBg = selected ? "bg-sel-soft" : "group-hover/row:bg-row-hover";
  return (
    <tr
      data-row={index}
      aria-selected={onSelect ? selected : undefined}
      className={cn("group/row scroll-mt-[30px]", flashing && "*:animate-flash")}
      onClick={onSelect ? () => onSelect(index) : undefined}
    >
      <td
        className={cn(
          "sticky left-0 z-[1] h-6 w-11 min-w-11 border-r border-b border-line-soft px-2 text-right",
          selected ? "bg-sel-soft text-fg" : "bg-editor text-fg-3 group-hover/row:bg-row-hover",
        )}
      >
        {index + 1}
      </td>
      {columns.map(({ key }) => (
        <DocumentTableCell key={key} doc={doc} field={key} value={fields[key]} className={cellBg} />
      ))}
    </tr>
  );
});
