import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  bsonLiteral,
  bsonTypeName,
  childEntries,
  dateIso,
  isPlainObject,
  plainText,
  relativeTime,
} from "../../lib/bsonValue";
import { EditableValue } from "./EditableValue";

const INDENT_PX = 14;
/** Fields shown inline in a collapsed object's preview before giving up. */
const PREVIEW_FIELDS = 3;

function ScalarText({ value, quoted = false }: { value: unknown; quoted?: boolean }) {
  if (value === null) return <span className="text-json-null">null</span>;

  const iso = dateIso(value);
  if (iso !== null) {
    const relative = relativeTime(iso);
    const parsed = new Date(iso);
    const shown = Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : iso;
    return (
      <>
        <span className="text-json-bson">{shown}</span>
        {relative && <span className="ml-2 text-text-faint">{relative}</span>}
      </>
    );
  }

  const literal = bsonLiteral(value);
  if (literal !== null) return <span className="text-json-bson">{literal}</span>;

  switch (typeof value) {
    case "string":
      return (
        <span className="text-json-string">{quoted ? `"${value}"` : value}</span>
      );
    case "number":
      return <span className="text-json-number">{value}</span>;
    case "boolean":
      return <span className="text-json-boolean">{String(value)}</span>;
    default:
      return <span className="text-text-muted">{String(value)}</span>;
  }
}

interface PreviewProps {
  value: unknown;
  /** Field to leave out, when the Key column already shows it. */
  omitKey?: string;
}

/** One-line summary of a collapsed object or array, as the row's value. */
function Preview({ value, omitKey }: PreviewProps) {
  if (Array.isArray(value)) {
    return <span className="text-text-muted">Array[{value.length}]</span>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const shown = entries
    .filter(([key]) => key !== omitKey)
    .slice(0, PREVIEW_FIELDS);
  return (
    // The field count is pinned outside the truncating span: it is the most
    // useful part of the preview, so it must survive a narrow column.
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-text-muted">
        {"{ "}
        {shown.map(([key, child], i) => (
          <span key={key}>
            {i > 0 && ", "}
            <span className="text-json-key">{key}</span>
            {": "}
            {childEntries(child) === null ? (
              <ScalarText value={child} quoted />
            ) : (
              <span className="text-text-faint">
                {Array.isArray(child) ? "[…]" : "{…}"}
              </span>
            )}
          </span>
        ))}
        {" }"}
      </span>
      <span className="shrink-0 text-text-faint">
        {entries.length} field{entries.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

interface Row {
  path: string;
  depth: number;
  label: string;
  ordinal: string | null;
  value: unknown;
  hasChildren: boolean;
  rootIndex: number | null;
  /** The document the row belongs to, and the field's path within it. */
  doc: unknown;
  fieldPath: string[];
}

function buildRows(
  entries: [string, unknown][],
  expanded: Set<string>,
  depth: number,
  parentPath: string,
  numbered: boolean,
  rows: Row[],
  doc: unknown,
  parentFieldPath: string[],
) {
  entries.forEach(([key, value], i) => {
    const path = `${parentPath}/${key}`;
    const children = childEntries(value);
    // In a result list each top-level row is a document of its own.
    const rowDoc = numbered ? value : doc;
    const fieldPath = numbered ? [] : [...parentFieldPath, key];
    rows.push({
      doc: rowDoc,
      fieldPath,
      path,
      depth,
      label: numbered ? documentLabel(value, i) : key,
      ordinal: numbered ? `(${String(i + 1).padStart(2, "0")})` : null,
      value,
      hasChildren: children !== null && children.length > 0,
      rootIndex: numbered ? i : null,
    });
    if (children !== null && expanded.has(path)) {
      buildRows(children, expanded, depth + 1, path, false, rows, rowDoc, fieldPath);
    }
  });
}

/** Documents in a result list are identified by their _id, like mongosh. */
function documentLabel(value: unknown, index: number): string {
  if (isPlainObject(value) && "_id" in value) {
    const id = value._id;
    if (isPlainObject(id) && typeof id.$oid === "string") return id.$oid;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return `[${index}]`;
}

interface JsonTableProps {
  value: unknown;
  /** Hover controls for top-level rows, e.g. copy/edit of a whole document. */
  rootActions?: (value: unknown, index: number) => ReactNode;
  className?: string;
}

export function JsonTable({ value, rootActions, className = "" }: JsonTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // A result list numbers its documents; a single object lists its own fields.
  const numbered = Array.isArray(value);
  const topEntries = childEntries(value) ?? [["value", value]];

  const rows: Row[] = [];
  buildRows(topEntries, expanded, 0, "", numbered, rows, value, []);

  const headCell =
    "sticky top-0 z-10 bg-panel-alt px-2 py-1.5 text-left font-semibold text-text-muted";

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[540px] table-fixed border-collapse font-mono text-xs">
        <colgroup>
          <col className="w-[34%]" />
          <col />
          <col className="w-[15%]" />
          {rootActions && <col className="w-[76px]" />}
        </colgroup>
        <thead>
          <tr>
            <th className={headCell}>Key</th>
            <th className={headCell}>Value</th>
            <th className={headCell}>Type</th>
            {rootActions && <th className={`${headCell} pr-3`} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const children = childEntries(row.value);
            const isOpen = expanded.has(row.path);
            return (
              <tr
                key={row.path}
                className="group border-b border-border-subtle/50 align-middle hover:bg-panel-hover"
              >
                <td
                  className={`truncate px-2 py-1 ${
                    row.hasChildren ? "cursor-pointer" : ""
                  }`}
                  style={{ paddingLeft: row.depth * INDENT_PX + 8 }}
                  title={row.label}
                  onClick={row.hasChildren ? () => toggle(row.path) : undefined}
                >
                  {row.hasChildren ? (
                    <ChevronRight
                      size={11}
                      className={`mr-1 inline-block align-[-1px] text-text-faint transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  ) : (
                    <span className="mr-1 inline-block w-[11px]" />
                  )}
                  {row.ordinal && (
                    <span className="mr-1 text-text-faint">{row.ordinal}</span>
                  )}
                  <span className="text-text-default">{row.label}</span>
                </td>
                <td
                  className="overflow-hidden px-2 py-1"
                  title={plainText(row.value)}
                >
                  {children === null ? (
                    <EditableValue
                      value={row.value}
                      doc={row.doc}
                      path={row.fieldPath}
                      block
                    >
                      <div className="truncate">
                        <ScalarText value={row.value} />
                      </div>
                    </EditableValue>
                  ) : children.length === 0 ? (
                    <span className="text-text-faint">
                      {Array.isArray(row.value) ? "Array[0]" : "{ }"}
                    </span>
                  ) : (
                    <Preview
                      value={row.value}
                      omitKey={row.depth === 0 && numbered ? "_id" : undefined}
                    />
                  )}
                </td>
                <td className="truncate px-2 py-1 text-text-muted">
                  {bsonTypeName(row.value, row.depth === 0 && numbered)}
                </td>
                {rootActions && (
                  <td className="py-1 pl-2 pr-3">
                    {row.rootIndex !== null && (
                      <span className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {rootActions(row.value, row.rootIndex)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
