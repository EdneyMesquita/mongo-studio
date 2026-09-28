import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A small 18px tag for index properties (unique, sparse, TTL, unused). */
export function IndexTag({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-sm bg-fg/7 px-1.5 text-xs font-medium text-fg-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
