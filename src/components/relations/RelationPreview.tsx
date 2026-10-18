import { ArrowLeftRight, Loader2 } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { dateIso, isPlainObject } from "../../lib/bsonValue";
import { keyText, valuesAt } from "../../lib/relations";
import type { FindRelatedOutput, RelatedFound } from "../../types/relations";
import type { LoadState } from "./useRelationData";

export type PreviewFilter = "all" | "many" | "none";

/** Fields whose few values say what a found document is, shown as its pill. */
const KIND_FIELDS = ["status", "state", "type", "kind"];

/** "DELIVERED ×2", "RETURNED ×1" - or "found ×3" when the documents have no such field. */
export function foundPills(found: RelatedFound): [string, number][] {
  const docs = found.docs.filter(isPlainObject);
  const field = KIND_FIELDS.find((f) => docs.length > 0 && docs.every((d) => typeof d[f] === "string"));
  if (!field || docs.length < found.count) return [["found", found.count]];
  const by = new Map<string, number>();
  for (const d of docs) by.set(String(d[field]), (by.get(String(d[field])) ?? 0) + 1);
  return [...by];
}

/** A sample document's line: the value it links by, and when it was written. */
function sampleKey(doc: unknown, field: string | null): string {
  const value = (field && !field.includes("{") ? valuesAt(doc, field)[0] : undefined) ?? (isPlainObject(doc) ? doc._id : undefined);
  return value === undefined ? "" : keyText(value);
}

function sampleTime(doc: unknown): string {
  if (!isPlainObject(doc)) return "";
  for (const v of Object.values(doc)) {
    const iso = dateIso(v);
    if (iso) return iso.slice(11, 19);
  }
  return "";
}

interface RelationPreviewProps {
  docs: unknown[];
  output: FindRelatedOutput | null;
  state: LoadState;
  error: string | null;
  /** Why there's nothing to preview yet, when there isn't. */
  idleText: string;
  keyField: string | null;
  selected: number;
  onSelect: (index: number) => void;
  filter: PreviewFilter;
  onFilter: (filter: PreviewFilter) => void;
}

/** Every sample document with what the relation finds for it. */
export function RelationPreview({ docs, output, state, error, idleText, keyField, selected, onSelect, filter, onFilter }: RelationPreviewProps) {
  const results = output?.results ?? [];
  const counts = {
    none: results.filter((r) => r.count === 0).length,
    one: results.filter((r) => r.count === 1).length,
    many: results.filter((r) => r.count > 1).length,
  };
  const rows = docs
    .map((d, i) => ({ d, i, found: results[i] }))
    .filter(({ found }) => filter === "all" || (found && (filter === "none" ? found.count === 0 : found.count > 1)));

  return (
    <div className="flex min-h-[180px] flex-1 flex-col border-t border-line">
      <div className="flex h-[38px] flex-none items-center gap-2.5 border-b border-line-soft bg-panel pl-5 pr-3 text-sm">
        <b className="font-semibold text-fg">Preview</b>
        <span className="min-w-0 truncate text-fg-3">
          {output
            ? `${docs.length} documents · ${counts.many} found several · ${counts.one} found one · ${counts.none} found none${output.truncated ? " · capped" : ""} · ${output.ms} ms`
            : state === "loading"
              ? "Matching…"
              : state === "error"
                ? ""
                : idleText}
        </span>
        {state === "loading" && <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-3" />}
        <span className="flex-1" />
        <SegmentedControl<PreviewFilter>
          aria-label="Show"
          size="sm"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "All" },
            { value: "many", label: "Several" },
            { value: "none", label: "None found" },
          ]}
        />
      </div>
      {error && (
        <p role="alert" className="m-0 px-5 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-auto">
        {rows.map(({ d, i, found }) => (
          <button
            type="button"
            key={i}
            aria-current={i === selected || undefined}
            onClick={() => onSelect(i)}
            className={cn(
              "grid h-[30px] w-full grid-cols-[36px_130px_70px_18px_minmax(0,1fr)] items-center gap-2.5 border-b border-line-soft px-5 text-left text-sm hover:bg-row-hover",
              i === selected && "bg-sel hover:bg-sel",
            )}
          >
            <span className="text-right text-[11px] tabular-nums text-fg-3">{i + 1}</span>
            <span className="truncate font-data text-[11.5px] text-fg">{sampleKey(d, keyField)}</span>
            <span className="font-data text-[11.5px] text-json-bson">{sampleTime(d)}</span>
            <ArrowLeftRight className="size-3 text-fg-3" />
            <span className="flex min-w-0 items-center gap-1.5">
              {!found ? (
                <span className="text-fg-3">-</span>
              ) : found.count === 0 ? (
                <Pill tone="none">none</Pill>
              ) : (
                foundPills(found).map(([label, n]) => (
                  <Pill key={label} tone={/revers|fail|error|cancel/i.test(label) ? "warn" : label === "found" ? "plain" : "ok"}>
                    {label} ×{n}
                  </Pill>
                ))
              )}
              {found?.rule != null && found.rule > 0 && (
                <span className="rounded-sm bg-fg/8 px-1.5 text-[10.5px] text-fg-2">rule {found.rule + 1}</span>
              )}
            </span>
          </button>
        ))}
        {rows.length === 0 && docs.length > 0 && output && <p className="m-0 px-5 py-2 text-sm text-fg-3">Nothing to show with this filter.</p>}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "none" | "plain"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-lg px-[7px] py-px font-data text-[10.5px] font-semibold",
        tone === "ok" && "bg-ok/13 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "none" && "bg-danger/12 text-danger",
        tone === "plain" && "bg-fg/8 text-fg-2",
      )}
    >
      {children}
    </span>
  );
}
