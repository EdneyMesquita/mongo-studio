import type { ReactNode } from "react";
import { ArrowLeftRight, ChevronRight, CircleCheck, Info, Loader2, Plus, SquareTerminal, TriangleAlert, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnectionColor } from "@/lib/connectionColor";
import { cn } from "@/lib/utils";
import { isPattern } from "../../lib/relations";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { Relation, RelationCheckLine, RelationCheckReport, RelationCondition } from "../../types/relations";
import { BRIDGES, OPS, templateBridge } from "./fieldRows";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { patternsOf, useNames } from "./useNames";

export type SectionId = "conn" | "tenant" | "rules" | "names" | "check";

interface RelationSettingsProps {
  relation: Relation;
  onChange: (relation: Relation) => void;
  ruleIndex: number;
  onRule: (index: number) => void;
  open: Set<SectionId>;
  onToggle: (id: SectionId) => void;
  /** The From document on screen, to pick how a template compares. */
  sampleDoc: unknown;
  sampleConnection: { id: string; name: string };
  sampleCollection: string | null;
  candidates: string[];
  tenant: string | null;
  targetConnectionId: string | null | undefined;
  check: { state: "idle" | "loading" | "ready" | "error"; report: RelationCheckReport | null; error: string | null };
  canCheck: boolean;
  onCheck: () => void;
  onCreateIndex: (line: RelationCheckLine) => void;
}

const AUTO = "__auto";
const NONE = "__none";

/** Connections, tenant, rules, names and the check: one line each until opened. */
export function RelationSettings(props: RelationSettingsProps) {
  const { relation: r, onChange, open, onToggle, check } = props;
  const profiles = useConnectionsStore((s) => s.profiles);
  const nameOf = (id: string | null | undefined) => profiles.find((p) => p.id === id)?.name ?? null;
  const set = (patch: Partial<Relation>) => onChange({ ...r, ...patch });
  const checkWarn = check.report?.lines.some((l) => l.kind === "warn") ?? false;

  const targetName = nameOf(props.targetConnectionId);
  const connSummary =
    r.to.conn === "same"
      ? "same connection"
      : r.to.conn === "cluster"
        ? props.targetConnectionId === undefined
          ? "pairing…"
          : targetName
            ? `paired with ${targetName}`
            : "no connection pairs"
        : (nameOf(r.to.conn) ?? "missing connection");

  return (
    <aside aria-label="Relation settings" className="min-h-0 overflow-auto border-l border-line bg-panel">
      <Section
        id="conn"
        title="Connections"
        summary={connSummary}
        warn={r.to.conn === "cluster" && props.targetConnectionId === null}
        open={open.has("conn")}
        onToggle={onToggle}
      >
        <SideFields
          label="From"
          conn={r.from.conn}
          connOptions={[{ value: "any", label: "Any connection with this database" }, ...profiles.map((p) => ({ value: p.id, label: p.name, hint: p.summary }))]}
          db={r.from.db}
          coll={r.from.coll}
          listFrom={r.from.conn === "any" ? props.sampleConnection.id : r.from.conn}
          patterns
          onChange={(from) => set({ from })}
          help={isPattern(r.from.coll) ? "A pattern like {tenant}_orders covers one collection per tenant." : undefined}
        />
        <SideFields
          label="To"
          conn={r.to.conn}
          connOptions={[
            { value: "cluster", label: "The one on the same cluster" },
            { value: "same", label: "The From connection itself" },
            ...profiles.map((p) => ({ value: p.id, label: p.name, hint: p.summary })),
          ]}
          db={r.to.db}
          coll={r.to.coll}
          listFrom={r.to.conn === "same" ? props.sampleConnection.id : r.to.conn === "cluster" ? props.targetConnectionId : r.to.conn}
          onChange={(to) => set({ to })}
          help={r.to.conn === "cluster" ? "Same cluster = same hosts in the connection string; no folders needed." : undefined}
        />
        {r.to.conn === "cluster" && (
          <PairRow
            from={props.sampleConnection}
            to={props.targetConnectionId}
            manual={props.sampleConnection.id in r.pairs}
            options={profiles.filter((p) => p.id !== props.sampleConnection.id).map((p) => ({ value: p.id, label: p.name, hint: p.summary }))}
            onPick={(value) => {
              const pairs = { ...r.pairs };
              if (value === AUTO) delete pairs[props.sampleConnection.id];
              else pairs[props.sampleConnection.id] = value === NONE ? null : value;
              set({ pairs });
            }}
          />
        )}
      </Section>

      <Section
        id="tenant"
        title="Tenant"
        summary={r.scope.length ? <span className="font-data text-[10.5px]">{`${r.scope[0].to} = ${r.scope[0].value}`}</span> : "none"}
        open={open.has("tenant")}
        onToggle={onToggle}
      >
        {isPattern(r.from.coll) && (
          <p className="m-0">
            <span className="font-data">{r.from.coll}</span>: <span className="font-data">{"{tenant}"}</span> is the varying part
            {props.tenant ? (
              <>
                {" "}
                (here <span className="font-data">{props.tenant}</span>)
              </>
            ) : null}
            .
          </p>
        )}
        {r.scope.map((s, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_12px_minmax(0,1fr)_22px] items-center gap-1.5">
            <span className="text-fg-3">Only where</span>
            <Input
              className="h-7 font-data text-sm"
              aria-label="To field"
              value={s.to}
              onChange={(e) => set({ scope: r.scope.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}
            />
            <span className="text-center text-fg-3">=</span>
            <Input
              className="h-7 font-data text-sm"
              aria-label="Value"
              value={s.value}
              onChange={(e) => set({ scope: r.scope.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
            />
            <Button variant="ghost" size="icon-xs" aria-label="Remove this filter" onClick={() => set({ scope: r.scope.filter((_, j) => j !== i) })}>
              <X />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => set({ scope: [...r.scope, { to: "store", value: isPattern(r.from.coll) ? "{tenant}" : "" }] })}
        >
          <Plus className="size-3.5" />
          Add a filter
        </Button>
        <p className="m-0 text-fg-3">
          Filters apply to {r.to.coll || "the To side"}. Values can use <span className="font-data">{"{tenant}"}</span> or a From field like{" "}
          <span className="font-data">{"{store}"}</span>. Going back from {r.toName ? `a ${r.toName}` : "the To side"}, the field tied to{" "}
          <span className="font-data">{"{tenant}"}</span> picks the collection to read: one collection, never a scan.
        </p>
      </Section>

      <Section
        id="rules"
        title="Rules"
        summary={r.rules.length > 1 ? `${r.rules.length} rules, tried in order` : `${r.rules[0]?.length ?? 0} ${r.rules[0]?.length === 1 ? "link" : "links"}`}
        open={open.has("rules")}
        onToggle={onToggle}
      >
        {r.rules.map((rule, i) => (
          <RuleBlock
            key={i}
            index={i}
            count={r.rules.length}
            rule={rule}
            note={r.ruleNotes[i] ?? ""}
            selected={i === props.ruleIndex}
            onSelect={() => props.onRule(i)}
            sampleDoc={props.sampleDoc}
            onChange={(next) => set({ rules: r.rules.map((x, j) => (j === i ? next : x)) })}
            onNote={(note) => {
              const notes = [...r.ruleNotes];
              while (notes.length <= i) notes.push("");
              notes[i] = note;
              set({ ruleNotes: notes });
            }}
            onRemove={() => {
              set({ rules: r.rules.filter((_, j) => j !== i), ruleNotes: r.ruleNotes.filter((_, j) => j !== i) });
              props.onRule(Math.max(0, Math.min(props.ruleIndex, r.rules.length - 2)));
            }}
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            set({ rules: [...r.rules, []] });
            props.onRule(r.rules.length);
          }}
        >
          <Plus className="size-3.5" />
          Add an alternative rule
        </Button>
        <p className="m-0 text-fg-3">
          A link's From side can be built from several fields, like <span className="font-data">{"{customerId}-{key}"}</span>. Arrays work on
          either side.
        </p>
      </Section>

      <Section id="names" title="Names" summary={`${r.fromName || "-"} · ${r.toName || "-"}`} open={open.has("names")} onToggle={onToggle}>
        <Labeled label={`From ${r.from.coll ? `a ${r.from.coll.replace("{tenant}_", "")} document` : "a From document"}, call them`}>
          <Input className="h-7 text-sm" value={r.fromName} placeholder="e.g. shipments" onChange={(e) => set({ fromName: e.target.value })} />
        </Labeled>
        <Labeled label="From the other side, call it">
          <Input className="h-7 text-sm" value={r.toName} placeholder="e.g. order" onChange={(e) => set({ toName: e.target.value })} />
        </Labeled>
        <p className="m-0 text-fg-3">How they show in Related and in column names; from either side you reach the other.</p>
      </Section>

      <Section
        id="check"
        title="Check"
        summary={check.state === "loading" ? "testing…" : !check.report ? "not tested yet" : checkWarn ? "needs a look" : "all good"}
        warn={checkWarn}
        open={open.has("check")}
        onToggle={onToggle}
      >
        <p className="m-0 text-fg-3">Reads a sample of each side in a few tenants, never all of them; nothing is written.</p>
        {check.error && <CheckLine line={{ kind: "warn", text: check.error, index: null }} />}
        {check.report?.lines.map((line, i) => <CheckLine key={i} line={line} onCreateIndex={props.onCreateIndex} />)}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" disabled={!props.canCheck || check.state === "loading"} onClick={props.onCheck}>
            {check.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {check.report ? "Test again" : "Test"}
          </Button>
        </div>
      </Section>
    </aside>
  );
}

function Section({
  id,
  title,
  summary,
  warn = false,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  summary: ReactNode;
  warn?: boolean;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line-soft">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="grid w-full grid-cols-[14px_auto_minmax(0,1fr)] items-center gap-1.5 px-3 py-[11px] text-left text-sm hover:bg-hover"
      >
        <ChevronRight className={cn("size-3 text-fg-3 transition-transform", open && "rotate-90")} />
        <b className="font-semibold text-fg">{title}</b>
        <span className={cn("max-w-full justify-self-end truncate text-xs text-fg-3", warn && "text-warn")}>{summary}</span>
      </button>
      {open && <div className="flex flex-col gap-2.5 pb-3.5 pl-8 pr-3 text-sm leading-normal text-fg-2">{children}</div>}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-fg-3">{label}</span>
      {children}
    </label>
  );
}

function Pick({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className={cn("w-full text-sm", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SideFields({
  label,
  conn,
  connOptions,
  db,
  coll,
  listFrom,
  patterns = false,
  onChange,
  help,
}: {
  label: string;
  conn: string;
  connOptions: ComboboxOption[];
  db: string;
  coll: string;
  /** The live connection whose databases and collections the pickers list. */
  listFrom: string | null | undefined;
  /** Offer `{tenant}` patterns the collection names suggest. */
  patterns?: boolean;
  onChange: (side: { conn: string; db: string; coll: string }) => void;
  help?: string;
}) {
  const names = useNames(listFrom, db);
  const known = connOptions.some((o) => o.value === conn) ? connOptions : [...connOptions, { value: conn, label: "Missing connection" }];
  const collOptions: ComboboxOption[] = [
    ...(patterns ? patternsOf(names.collections).map(({ pattern, count }) => ({ value: pattern, hint: `${count.toLocaleString("en")} collections` })) : []),
    ...names.collections.map((c) => ({ value: c })),
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <Labeled label={label}>
        <Combobox
          aria-label={`${label} connection`}
          size="sm"
          value={conn}
          options={known}
          searchPlaceholder="Search connections…"
          onChange={(v) => onChange({ conn: v, db, coll })}
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-1.5">
        <Combobox
          aria-label={`${label} database`}
          size="sm"
          mono
          allowCustom
          value={db}
          placeholder="database"
          searchPlaceholder="Search databases…"
          options={names.databases.map((d) => ({ value: d }))}
          onChange={(v) => onChange({ conn, db: v, coll: v === db ? coll : "" })}
        />
        <Combobox
          aria-label={`${label} collection`}
          size="sm"
          mono
          allowCustom
          value={coll}
          placeholder="collection"
          searchPlaceholder={patterns ? "Search, or type a {tenant} pattern…" : "Search collections…"}
          options={collOptions}
          loading={names.loading}
          onOpen={names.load}
          onChange={(v) => onChange({ conn, db, coll: v })}
        />
      </div>
      {help && <span className="text-xs text-fg-3">{help}</span>}
    </div>
  );
}

function PairRow({
  from,
  to,
  manual,
  options,
  onPick,
}: {
  from: { id: string; name: string };
  to: string | null | undefined;
  manual: boolean;
  options: ComboboxOption[];
  onPick: (value: string) => void;
}) {
  const autoName = !manual && to ? options.find((o) => o.value === to)?.label : null;
  const fromColor = useConnectionColor(from.id);
  const value = !manual ? AUTO : to === null ? NONE : (to ?? AUTO);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-3">Pairs</span>
      <div className="grid grid-cols-[minmax(0,1fr)_14px_minmax(0,1.2fr)] items-center gap-1.5 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <ConnectionChip name={from.name} color={fromColor} size="sm" />
          <span className="truncate">{from.name}</span>
        </span>
        <ArrowLeftRight className="size-3 text-fg-3" />
        <Combobox
          aria-label={`Connection ${from.name} reads`}
          size="sm"
          value={value}
          options={[
            { value: AUTO, label: autoName ? `${autoName} (same cluster)` : "Same cluster (automatic)" },
            ...options,
            { value: NONE, label: `None - skip ${from.name}` },
          ]}
          searchPlaceholder="Search connections…"
          onChange={onPick}
        />
      </div>
      {!manual && to === null && (
        <span className="inline-flex items-center gap-1 text-xs text-warn">
          <TriangleAlert className="size-3" />
          No other connection to this cluster; pick one.
        </span>
      )}
    </div>
  );
}

function RuleBlock({
  index,
  count,
  rule,
  note,
  selected,
  sampleDoc,
  onSelect,
  onChange,
  onNote,
  onRemove,
}: {
  index: number;
  count: number;
  rule: RelationCondition[];
  note: string;
  selected: boolean;
  sampleDoc: unknown;
  onSelect: () => void;
  onChange: (rule: RelationCondition[]) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const patch = (i: number, c: Partial<RelationCondition>) => onChange(rule.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <>
      {index > 0 && (
        <div className="-my-1 flex items-center gap-2 text-xs text-fg-3 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
          or, when that finds nothing
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-md border border-line bg-editor px-[9px] py-[7px]",
          selected && "border-accent bg-accent/8",
        )}
      >
        <div className="flex items-center gap-1.5">
          <button type="button" className="flex-1 text-left font-semibold text-fg" onClick={onSelect} aria-pressed={selected}>
            {count > 1 ? `Rule ${index + 1}` : "Links"}
            <span className="ml-1.5 font-normal text-fg-3">{rule.length > 1 ? "all of these" : ""}</span>
          </button>
          {count > 1 && (
            <Button variant="ghost" size="icon-xs" aria-label={`Remove rule ${index + 1}`} onClick={onRemove}>
              <X />
            </Button>
          )}
        </div>
        {rule.map((c, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22px] gap-1">
            <Input
              className="h-7 font-data text-xs"
              aria-label="From field or template"
              value={c.from}
              onChange={(e) => patch(i, { from: e.target.value, as: templateBridge(e.target.value, c.as, sampleDoc) })}
            />
            <Input className="h-7 font-data text-xs" aria-label="To field" value={c.to} onChange={(e) => patch(i, { to: e.target.value })} />
            <Button variant="ghost" size="icon-xs" aria-label="Remove this link" onClick={() => onChange(rule.filter((_, j) => j !== i))}>
              <X />
            </Button>
            <Pick label="Operator" value={c.op} options={OPS} onChange={(v) => patch(i, { op: v as RelationCondition["op"] })} className="h-7 text-xs" />
            <Pick label="Compare as" value={c.as} options={BRIDGES} onChange={(v) => patch(i, { as: v as RelationCondition["as"] })} className="h-7 text-xs" />
          </div>
        ))}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect();
              onChange([...rule, { from: "", op: "eq", to: "", as: "as-stored" }]);
            }}
          >
            <Plus className="size-3.5" />
            Add a link
          </Button>
        </div>
        {count > 1 && (
          <Input className="h-7 text-xs" aria-label="Note" placeholder="When this rule applies (optional)" value={note} onChange={(e) => onNote(e.target.value)} />
        )}
      </div>
    </>
  );
}

function CheckLine({ line, onCreateIndex }: { line: RelationCheckLine; onCreateIndex?: (line: RelationCheckLine) => void }) {
  const Icon = line.kind === "ok" ? CircleCheck : line.kind === "warn" ? TriangleAlert : Info;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-start gap-2 text-xs">
        <Icon className={cn("mt-px size-3.5 shrink-0", line.kind === "ok" ? "text-ok" : line.kind === "warn" ? "text-warn" : "text-fg-3")} />
        <span>{line.text}</span>
      </div>
      {line.index && onCreateIndex && (
        <Button size="sm" className="ml-5" onClick={() => onCreateIndex(line)}>
          <SquareTerminal className="size-3.5" />
          Create index…
        </Button>
      )}
    </div>
  );
}
