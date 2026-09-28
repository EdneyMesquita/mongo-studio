import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Indent per level, and the left padding before level 0. */
const STEP = 16;
const START = 6;

/** One 1px guide per nesting level, under each parent's chevron. */
function guides(depth: number): CSSProperties {
  const style: CSSProperties = { paddingLeft: START + depth * STEP };
  if (depth === 0) return style;
  const levels = Array.from({ length: depth }, (_, i) => i);
  return {
    ...style,
    // longhands, so the row's hover background still applies
    backgroundImage: levels
      .map(() => "linear-gradient(var(--color-line), var(--color-line))")
      .join(", "),
    backgroundPosition: levels.map((i) => `${START + i * STEP + 7.5}px 0`).join(", "),
    backgroundSize: levels.map(() => "1px 100%").join(", "),
    backgroundRepeat: "no-repeat",
  };
}

interface KvRowProps {
  depth: number;
  /** Open state of a row with children; undefined for a leaf. */
  expanded?: boolean;
  onToggle?: () => void;
  /** The key (or index); a colon follows it. Omitted for a bare value. */
  label?: ReactNode;
  /** The value. */
  children: ReactNode;
  /** The faint type tag, right-aligned. */
  type?: ReactNode;
  /** Controls revealed on hover at the row's end. */
  actions?: ReactNode;
  /** Classes for the value cell. */
  valueClassName?: string;
  /** Accessible name of the row. */
  "aria-label"?: string;
}

/**
 * A key/value tree row (inspector, tree view, console): 16px chevron, key,
 * value, type tag, with indent guides. Clicking a row with children toggles it.
 */
export function KvRow({
  depth,
  expanded,
  onToggle,
  label,
  children,
  type,
  actions,
  valueClassName,
  ...aria
}: KvRowProps) {
  const toggles = expanded !== undefined && onToggle !== undefined;
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={toggles ? expanded : undefined}
      aria-label={aria["aria-label"]}
      className={cn(
        "group/kv relative grid min-h-6 grid-cols-[16px_auto_minmax(0,1fr)_auto] items-start gap-x-1 py-0.5 pr-2.5 hover:bg-row-hover",
        // only rows that expand are clickable; a leaf is not
        !toggles && "cursor-default",
      )}
      style={guides(depth)}
      onClick={toggles ? onToggle : undefined}
    >
      <span className="mt-0.5 grid size-4 place-items-center text-fg-3">
        {toggles && (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            className="grid size-4 place-items-center rounded-xs outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <ChevronRight
              className={cn(
                "size-3 transition-transform duration-150 ease-out-expo",
                expanded && "rotate-90",
              )}
            />
          </button>
        )}
      </span>
      <span className="whitespace-nowrap">
        {label !== undefined && (
          <>
            {label}
            <span className="mr-1.5 text-json-punct">:</span>
          </>
        )}
      </span>
      <span className={cn("min-w-0", valueClassName)}>{children}</span>
      <span className="pl-2 font-sans text-[10px] leading-5 whitespace-nowrap text-fg-3">
        {type}
      </span>
      {actions && (
        <span className="absolute top-0.5 right-1.5 flex gap-0.5 bg-row-hover opacity-0 group-hover/kv:opacity-100 focus-within:opacity-100">
          {actions}
        </span>
      )}
    </div>
  );
}
