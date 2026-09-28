import { useCallback, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/** Below this many rows every row renders; above it only the visible window. */
export const VIRTUALIZE_FROM = 100;
/** Rows rendered above and below the visible ones, so fast scrolling doesn't flash blank. */
const OVERSCAN = 12;
/** Until a row is measured: 24px plus its 1px rule. */
const ESTIMATED_ROW = 25;

export interface VirtualRows {
  /** Whether rows are windowed at all (large results only). */
  enabled: boolean;
  start: number;
  /** Exclusive. */
  end: number;
  /** Space standing in for the rows above and below the window, in px. */
  padTop: number;
  padBottom: number;
  /** Scrolls so the row is fully visible, rendered or not. */
  reveal: (index: number) => void;
}

/**
 * Windowing for a table of equal-height rows inside `scroller`: only the
 * rows in view (plus a margin) are rendered, spacers keep the scrollbar
 * true to the whole list. `headerHeight` is the sticky header's height.
 */
export function useVirtualRows(
  scroller: RefObject<HTMLElement | null>,
  count: number,
  headerHeight: number,
): VirtualRows {
  const enabled = count > VIRTUALIZE_FROM;
  const [rowHeight, setRowHeight] = useState(ESTIMATED_ROW);
  const [view, setView] = useState({ top: 0, height: 800 });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return;
    const measure = () => {
      const row = el.querySelector<HTMLElement>("tbody tr[data-row]");
      if (row && row.offsetHeight > 0) setRowHeight(row.offsetHeight);
      setView({ top: el.scrollTop, height: el.clientHeight });
    };
    measure();
    const onScroll = () => setView({ top: el.scrollTop, height: el.clientHeight });
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [scroller, enabled, count]);

  const reveal = useCallback(
    (index: number) => {
      const el = scroller.current;
      if (!el) return;
      if (!enabled) {
        el.querySelector(`tr[data-row="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      const top = index * rowHeight;
      const visible = el.clientHeight - headerHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowHeight > el.scrollTop + visible) el.scrollTop = top + rowHeight - visible;
    },
    [scroller, enabled, rowHeight, headerHeight],
  );

  if (!enabled) return { enabled, start: 0, end: count, padTop: 0, padBottom: 0, reveal };
  // row i sits at header + i * rowHeight; the sticky header covers the top
  const first = Math.floor(view.top / rowHeight);
  const start = Math.max(0, first - OVERSCAN);
  const end = Math.min(count, first + Math.ceil(view.height / rowHeight) + OVERSCAN);
  return {
    enabled,
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (count - end) * rowHeight,
    reveal,
  };
}
