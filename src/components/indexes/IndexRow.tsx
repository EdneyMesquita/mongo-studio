import type { IndexInfo } from "../../types/query";
import type { IndexUsage } from "./useIndexStats";
import { indexProperties } from "./indexProperties";
import { IndexKeyChips } from "./IndexKeyChips";
import { IndexTag } from "./IndexTag";
import { IndexUsageCell } from "./IndexUsageCell";

const sinceFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

interface IndexRowProps {
  index: IndexInfo;
  /** Undefined when `$indexStats` didn't report this index (or failed). */
  usage: IndexUsage | undefined;
  maxOps: number;
}

const cell = "h-8 border-b border-line-soft px-3.5 whitespace-nowrap";

export function IndexRow({ index, usage, maxOps }: IndexRowProps) {
  const tags = indexProperties(index.unique, usage?.spec ?? null);
  return (
    <tr className="hover:bg-row-hover">
      <td className={`${cell} font-data text-fg`}>{index.name}</td>
      <td className={cell}>
        <IndexKeyChips indexKey={index.key} />
      </td>
      <td className={cell}>
        <span className="inline-flex gap-1">
          {tags.map((tag) => (
            <IndexTag key={tag}>{tag}</IndexTag>
          ))}
        </span>
      </td>
      <td className={cell}>
        <IndexUsageCell ops={usage?.ops ?? null} maxOps={maxOps} />
      </td>
      <td className={`${cell} text-fg-2`}>
        {usage?.since ? sinceFormat.format(usage.since) : <span className="text-fg-3">—</span>}
      </td>
    </tr>
  );
}
