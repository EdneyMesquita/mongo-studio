import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { bsonLiteral, childEntries, isPlainObject } from "../../lib/bsonValue";
import { EditableValue } from "./EditableValue";

const INDENT_PX = 14;

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
  /** The tree's root value, and this node's field path from it. */
  doc: unknown;
  path: string[];
  depth: number;
  defaultOpenDepth: number;
  isLast: boolean;
  name?: string;
  isIndex?: boolean;
}

function JsonNode({
  value,
  doc,
  path,
  depth,
  defaultOpenDepth,
  isLast,
  name,
  isIndex = false,
}: JsonNodeProps) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);

  const isArray = Array.isArray(value);
  const entries = childEntries(value);

  if (entries === null) {
    return (
      <div
        className="break-words py-px"
        style={{ paddingLeft: depth * INDENT_PX + 14 }}
      >
        <NodeLabel name={name} isIndex={isIndex} />
        <EditableValue value={value} doc={doc} path={path}>
          <Scalar value={value} />
        </EditableValue>
        {!isLast && <span className="text-json-punct">,</span>}
      </div>
    );
  }

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
              doc={doc}
              path={[...path, key]}
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
        doc={value}
        path={[]}
        depth={0}
        defaultOpenDepth={defaultOpenDepth}
        isLast
      />
    </div>
  );
}
