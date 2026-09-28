import { IndexTag } from "./IndexTag";

interface IndexUsageCellProps {
  ops: number | null;
  /** The busiest index's ops, which fills the bar. */
  maxOps: number;
}

/** A 64px bar proportional to the busiest index, the op count, and "unused". */
export function IndexUsageCell({ ops, maxOps }: IndexUsageCellProps) {
  if (ops === null) return <span className="text-fg-3">—</span>;
  const share = maxOps > 0 ? (ops / maxOps) * 100 : 0;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-line">
        <span className="block h-full bg-accent" style={{ width: `${share}%` }} />
      </span>
      {ops.toLocaleString()} ops
      {ops === 0 && <IndexTag className="text-warn">unused</IndexTag>}
    </span>
  );
}
