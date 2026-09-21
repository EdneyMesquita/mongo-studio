import { useState } from "react";
import { ChevronRight } from "lucide-react";

const INDENT_PX = 14;

/**
 * The backend sends relaxed Extended JSON, so BSON types arrive as wrapper
 * objects. Rendering `{"$oid": "..."}` as an expandable node would bury the
 * value two lines deep, so collapse the known wrappers back into the scalar
 * they stand for, spelled the way mongosh spells it.
 *
 * Returns null for anything that is a genuine object.
 */
function bsonLiteral(value: Record<string, unknown>): string | null {
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;

  switch (keys[0]) {
    case "$oid":
      return `ObjectId("${String(value.$oid)}")`;
    case "$date": {
      const date = value.$date;
      if (typeof date === "string") return `ISODate("${date}")`;
      // out-of-range dates stay as { $date: { $numberLong } } even in relaxed mode
      if (isPlainObject(date) && typeof date.$numberLong === "string") {
        return `ISODate(${date.$numberLong})`;
      }
      return null;
    }
    case "$numberDecimal":
      return `Decimal128("${String(value.$numberDecimal)}")`;
    case "$numberLong":
      return `Long("${String(value.$numberLong)}")`;
    case "$numberInt":
      return String(value.$numberInt);
    case "$numberDouble":
      return String(value.$numberDouble);
    case "$timestamp": {
      const ts = value.$timestamp;
      if (!isPlainObject(ts)) return null;
      return `Timestamp(${String(ts.t)}, ${String(ts.i)})`;
    }
    case "$binary": {
      const bin = value.$binary;
      if (!isPlainObject(bin)) return null;
      const base64 = String(bin.base64 ?? "");
      const shown = base64.length > 24 ? `${base64.slice(0, 24)}…` : base64;
      return `BinData(${String(bin.subType ?? "00")}, "${shown}")`;
    }
    case "$regularExpression": {
      const re = value.$regularExpression;
      if (!isPlainObject(re)) return null;
      return `/${String(re.pattern ?? "")}/${String(re.options ?? "")}`;
    }
    case "$code":
      return `Code(${JSON.stringify(value.$code)})`;
    case "$symbol":
      return `Symbol("${String(value.$symbol)}")`;
    case "$minKey":
      return "MinKey";
    case "$maxKey":
      return "MaxKey";
    case "$undefined":
      return "undefined";
    default:
      return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="text-json-null">null</span>;
  if (isPlainObject(value)) {
    const literal = bsonLiteral(value);
    if (literal !== null) return <span className="text-json-bson">{literal}</span>;
  }
  switch (typeof value) {
    case "string":
      return <span className="text-json-string">"{value}"</span>;
    case "number":
      return <span className="text-json-number">{value}</span>;
    case "boolean":
      return <span className="text-json-boolean">{String(value)}</span>;
    default:
      return <span className="text-text-muted">{String(value)}</span>;
  }
}

function NodeLabel({ name, isIndex }: { name?: string; isIndex: boolean }) {
  if (name === undefined) return null;
  return (
    <>
      <span className={isIndex ? "text-text-faint" : "text-json-key"}>{name}</span>
      <span className="text-json-punct">: </span>
    </>
  );
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  defaultOpenDepth: number;
  isLast: boolean;
  name?: string;
  isIndex?: boolean;
}

function JsonNode({
  value,
  depth,
  defaultOpenDepth,
  isLast,
  name,
  isIndex = false,
}: JsonNodeProps) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);

  const isArray = Array.isArray(value);
  const isBranch =
    isArray || (isPlainObject(value) && bsonLiteral(value) === null);

  if (!isBranch) {
    return (
      <div
        className="break-words py-px"
        style={{ paddingLeft: depth * INDENT_PX + 14 }}
      >
        <NodeLabel name={name} isIndex={isIndex} />
        <Scalar value={value} />
        {!isLast && <span className="text-json-punct">,</span>}
      </div>
    );
  }

  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const [openBrace, closeBrace] = isArray ? ["[", "]"] : ["{", "}"];
  const summary = isArray
    ? `${entries.length} item${entries.length === 1 ? "" : "s"}`
    : `${entries.length} field${entries.length === 1 ? "" : "s"}`;
  const trailingComma = !isLast && <span className="text-json-punct">,</span>;

  const isEmpty = entries.length === 0;

  return (
    <div>
      <div
        className={`break-words rounded-sm py-px ${
          isEmpty ? "" : "cursor-pointer hover:bg-panel-hover"
        }`}
        style={{ paddingLeft: depth * INDENT_PX }}
        onClick={isEmpty ? undefined : () => setOpen((o) => !o)}
      >
        {isEmpty ? (
          <span className="mr-0.5 inline-block w-[11px]" />
        ) : (
          <ChevronRight
            size={11}
            className={`mr-0.5 inline-block shrink-0 align-[-1px] text-text-faint transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        )}
        <NodeLabel name={name} isIndex={isIndex} />
        <span className="text-json-punct">{openBrace}</span>
        {(!open || isEmpty) && (
          <>
            {!isEmpty && <span className="text-text-faint"> {summary} </span>}
            <span className="text-json-punct">{closeBrace}</span>
            {trailingComma}
          </>
        )}
      </div>

      {open && !isEmpty && (
        <>
          {entries.map(([key, child], i) => (
            <JsonNode
              key={key}
              name={key}
              isIndex={isArray}
              value={child}
              depth={depth + 1}
              defaultOpenDepth={defaultOpenDepth}
              isLast={i === entries.length - 1}
            />
          ))}
          <div style={{ paddingLeft: depth * INDENT_PX + 14 }}>
            <span className="text-json-punct">{closeBrace}</span>
            {trailingComma}
          </div>
        </>
      )}
    </div>
  );
}

interface JsonTreeProps {
  value: unknown;
  /** Nodes shallower than this start expanded; deeper ones start collapsed. */
  defaultOpenDepth?: number;
  className?: string;
}

export function JsonTree({
  value,
  defaultOpenDepth = 1,
  className = "",
}: JsonTreeProps) {
  return (
    <div className={`font-mono text-xs leading-[1.5] ${className}`}>
      <JsonNode
        value={value}
        depth={0}
        defaultOpenDepth={defaultOpenDepth}
        isLast
      />
    </div>
  );
}
