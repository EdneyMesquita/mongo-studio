import { Check, ChevronLeft, ChevronRight, Filter, Layers, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ActionMenuButton, type MenuEntry } from "@/components/common/ActionMenu";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { Button } from "@/components/ui/button";
import { useConnectionColor } from "@/lib/connectionColor";
import { cn } from "@/lib/utils";
import { keyText } from "../../lib/relations";
import type { Relation, RelationCondition } from "../../types/relations";
import { BsonCell } from "../grid/BsonCell";
import { BRIDGES, conditionLabel, fillTemplate, OPS, shortType, type FieldRow } from "./fieldRows";

/** Row and card-head heights the wires are drawn against. */
const ROW = 30;
const HEAD = 92;
/** The wires' column: up to 180px, narrower when the cards need the customer. */
const WIRES_MAX = 180;

export interface CanvasSide {
  rows: FieldRow[];
  doc: unknown;
  /** Line 1: the connection. */
  connection: { id: string; name: string } | null;
  connectionText: ReactNode;
  /** Line 2: database · collection. */
  db: string;
  coll: string;
  /** Line 3: what's sampled / found, with its navigation. */
  status: ReactNode;
  /** In place of the rows when there's nothing to show. */
  empty?: ReactNode;
}

interface RelationCanvasProps {
  relation: Relation;
  rule: RelationCondition[];
  left: CanvasSide;
  right: CanvasSide;
  /** The From field waiting for its To field. */
  pending: string | null;
  tenant: string | null;
  expanded: { left: Set<string>; right: Set<string> };
  onToggleExpand: (side: "left" | "right", path: string) => void;
  onPickLeft: (path: string) => void;
  onPickRight: (path: string) => void;
  onChange: (from: RelationCondition, to: RelationCondition | null) => void;
}

/**
 * A sample From document and the To document it finds side by side, with
 * a wire per linked field pair. Click a field on the left, then one on the
 * right, to link them; a wire's chip changes how they compare.
 */
export function RelationCanvas({
  relation,
  rule,
  left,
  right,
  pending,
  tenant,
  expanded,
  onToggleExpand,
  onPickLeft,
  onPickRight,
  onChange,
}: RelationCanvasProps) {
  const wiresRef = useRef<HTMLDivElement>(null);
  const [wiresW, setWiresW] = useState(WIRES_MAX);
  useLayoutEffect(() => {
    const el = wiresRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWiresW(Math.round(el.clientWidth) || WIRES_MAX));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const WIRES_W = wiresW;
  const linkedL = new Set(rule.map((c) => c.from));
  const linkedR = new Set(rule.map((c) => c.to));
  const scoped = new Set(relation.scope.map((s) => s.to));
  const rowsH = Math.max(left.empty ? 3 : left.rows.length, right.empty ? 3 : right.rows.length);
  const h = HEAD + rowsH * ROW + 8;
  const wires = rule.flatMap((c) => {
    const li = left.rows.findIndex((r) => r.path === c.from);
    const ri = right.rows.findIndex((r) => r.path === c.to);
    if (li < 0 || ri < 0 || left.empty || right.empty) return [];
    const y1 = HEAD + li * ROW + ROW / 2;
    const y2 = HEAD + ri * ROW + ROW / 2;
    return [{ c, y1, y2, chip: (y1 + y2) / 2 - 11, d: `M0 ${y1} C ${WIRES_W * 0.4} ${y1}, ${WIRES_W * 0.6} ${y2}, ${WIRES_W} ${y2}` }];
  });
  // crossing wires meet halfway: keep their chips from covering each other
  [...wires].sort((a, b) => a.chip - b.chip).forEach((w, i, sorted) => {
    if (i > 0 && w.chip < sorted[i - 1].chip + 26) w.chip = sorted[i - 1].chip + 26;
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_clamp(96px,16%,180px)_minmax(0,1fr)] px-5 pb-1.5 pt-[18px]" style={{ minHeight: h + 24 }}>
      <Card side={left}>
        {left.empty ??
          left.rows.map((row) => (
            <FieldButton
              key={row.path}
              row={row}
              side="left"
              on={linkedL.has(row.path)}
              pending={pending === row.path}
              open={expanded.left.has(row.path)}
              onToggle={() => onToggleExpand("left", row.path)}
              onClick={() => onPickLeft(row.path)}
              title={row.built ? "Built from several fields" : "Click, then click a field on the right to link them"}
              value={row.built ? <span className="text-fg">"{fillTemplate(row.path, left.doc, keyText).slice(0, 40)}"</span> : undefined}
            />
          ))}
      </Card>

      <div ref={wiresRef} className="relative" aria-hidden={wires.length === 0}>
        <svg width={WIRES_W} height={h} viewBox={`0 0 ${WIRES_W} ${h}`} className="absolute left-0 top-0 overflow-visible">
          {wires.map((w) => (
            <g key={`${w.c.from}|${w.c.to}`}>
              <path d={w.d} className="fill-none stroke-accent opacity-85" strokeWidth={1.6} />
              <circle cx={0} cy={w.y1} r={3.5} className="fill-accent" />
              <circle cx={WIRES_W} cy={w.y2} r={3.5} className="fill-accent" />
            </g>
          ))}
        </svg>
        {wires.map((w) => (
          <WireChip key={`${w.c.from}|${w.c.to}`} condition={w.c} top={w.chip} onChange={onChange} />
        ))}
        {wires.length === 0 && !left.empty && !right.empty && (
          <div className="absolute inset-x-3 text-center text-sm leading-normal text-fg-3" style={{ top: HEAD + 30 }}>
            {pending ? "Now click a field on the right." : "Click a field on the left, then one on the right."}
          </div>
        )}
      </div>

      <Card side={right}>
        {right.empty ??
          right.rows.map((row) => (
            <FieldButton
              key={row.path}
              row={row}
              side="right"
              on={linkedR.has(row.path)}
              scoped={scoped.has(row.path)}
              open={expanded.right.has(row.path)}
              onToggle={() => onToggleExpand("right", row.path)}
              onClick={() => onPickRight(row.path)}
              title={pending ? `Link ${pending} to ${row.path}` : "Click a field on the left first"}
              value={
                scoped.has(row.path) ? (
                  <span
                    title={`Always: only documents where ${row.path} = {tenant}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-ok/14 px-[7px] py-px font-data text-[10.5px] font-semibold text-ok"
                  >
                    <Filter className="size-2.5" />= {tenant || "{tenant}"}
                  </span>
                ) : undefined
              }
            />
          ))}
      </Card>
    </div>
  );
}

function Card({ side, children }: { side: CanvasSide; children: ReactNode }) {
  const color = useConnectionColor(side.connection?.id ?? "");
  return (
    <div className="self-start overflow-hidden rounded-lg border border-line bg-panel">
      <div className="box-border flex h-[92px] flex-col gap-1 border-b border-line px-3 py-[9px]">
        <div className="flex items-center gap-[7px] overflow-hidden whitespace-nowrap text-sm text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
          {side.connection && <ConnectionChip name={side.connection.name} color={color} size="sm" />}
          <span className="truncate">{side.connectionText}</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap font-data text-[12.5px] text-fg">
          {side.db || side.coll ? (
            <span className="truncate">
              {side.db || "…"} · {side.coll || "…"}
            </span>
          ) : (
            <span className="truncate font-sans text-sm text-fg-3">No collection picked yet</span>
          )}
          {side.coll.includes("{tenant}") && (
            <span
              title="One collection per tenant"
              className="inline-flex shrink-0 items-center gap-[3px] rounded-lg bg-accent/12 px-1.5 py-px font-data text-[10px] font-semibold text-accent-text"
            >
              <Layers className="size-2.5" />
              {"{tenant}"}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-fg-3">{side.status}</div>
      </div>
      {children}
    </div>
  );
}

interface FieldButtonProps {
  row: FieldRow;
  side: "left" | "right";
  on: boolean;
  pending?: boolean;
  scoped?: boolean;
  open: boolean;
  title: string;
  value?: ReactNode;
  onToggle: () => void;
  onClick: () => void;
}

function FieldButton({ row, side, on, pending, scoped, open, title, value, onToggle, onClick }: FieldButtonProps) {
  const port = (
    <span
      className={cn(
        "size-[9px] justify-self-center rounded-full border-[1.5px] border-field-line bg-editor",
        (on || pending) && "border-accent bg-accent",
        pending && "animate-pulse",
      )}
    />
  );
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "relative grid h-[30px] w-full cursor-pointer items-center gap-2 border-b border-line-soft text-left text-sm outline-none last:border-b-0 hover:bg-hover focus-visible:bg-hover",
        side === "left"
          ? "grid-cols-[minmax(70px,0.9fr)_40px_minmax(0,1.4fr)_14px] pl-3 pr-2.5"
          : "grid-cols-[14px_minmax(70px,0.9fr)_40px_minmax(0,1.4fr)] pl-2.5 pr-3",
        on && "bg-accent/9",
        scoped && "bg-ok/7",
        pending && "bg-accent/18 shadow-[inset_2px_0_0_var(--color-accent)]",
      )}
    >
      {side === "right" && port}
      <span className="flex min-w-0 items-center" style={{ paddingLeft: row.depth * 12 }}>
        {row.expandable && (
          <button
            type="button"
            aria-label={open ? `Hide the fields of ${row.path}` : `Show the fields of ${row.path}`}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="-ml-1 mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-sm text-fg-3 hover:text-fg"
          >
            <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
          </button>
        )}
        <span
          className={cn(
            "truncate font-data text-xs text-fg",
            on && "font-semibold text-accent-text",
            row.built && "italic",
            row.missing && "text-fg-3",
          )}
        >
          {row.label}
        </span>
      </span>
      <span className="font-data text-[10.5px] text-fg-3">{row.built ? "built" : shortType(row.value)}</span>
      <span className="min-w-0 truncate font-data text-[11.5px]">
        {value ?? (row.value === undefined ? <span className="text-fg-3">-</span> : <BsonCell value={row.value} />)}
      </span>
      {side === "left" && port}
    </div>
  );
}

function WireChip({
  condition,
  top,
  onChange,
}: {
  condition: RelationCondition;
  top: number;
  onChange: (from: RelationCondition, to: RelationCondition | null) => void;
}) {
  const entries = (): MenuEntry[] => [
    { heading: `${condition.from} → ${condition.to}` },
    ...OPS.map(([op, label]) => ({
      label,
      icon: condition.op === op ? Check : undefined,
      onSelect: () => onChange(condition, { ...condition, op }),
    })),
    { separator: true },
    ...BRIDGES.map(([as, label]) => ({
      label: `Compare as ${label}`,
      icon: condition.as === as ? Check : undefined,
      onSelect: () => onChange(condition, { ...condition, as }),
    })),
    { separator: true },
    { label: "Remove this link", icon: Trash2, danger: true, onSelect: () => onChange(condition, null) },
  ];
  return (
    <div className="absolute left-1/2 -translate-x-1/2" style={{ top }}>
      <ActionMenuButton
        label="Change how they compare"
        align="center"
        entries={entries}
        trigger={
          <button
            type="button"
            title="Change how they compare"
            className="h-[22px] whitespace-nowrap rounded-[11px] border border-accent/40 bg-popover px-2 text-[10.5px] text-fg-2 shadow-[0_1px_3px_rgba(0,0,0,.2)] hover:border-accent hover:text-fg"
          >
            {conditionLabel(condition) || "equals"}
          </button>
        }
      />
    </div>
  );
}

/** "‹ 3 of 20 ›" */
export function Stepper({
  index,
  count,
  label,
  onStep,
}: {
  index: number;
  count: number;
  label: string;
  onStep: (delta: number) => void;
}) {
  return (
    <>
      <Button variant="ghost" size="icon-xs" aria-label={`Previous ${label}`} disabled={index <= 0} onClick={() => onStep(-1)}>
        <ChevronLeft />
      </Button>
      <span className="tabular-nums">
        {index + 1} of {count}
      </span>
      <Button variant="ghost" size="icon-xs" aria-label={`Next ${label}`} disabled={index >= count - 1} onClick={() => onStep(1)}>
        <ChevronRight />
      </Button>
    </>
  );
}

