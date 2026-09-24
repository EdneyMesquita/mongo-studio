import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { DEFAULT_SIDEBAR_WIDTH, useUiStore } from "../../store/uiStore";

const MIN_WIDTH = 180;
const KEY_STEP = 16;

/** Widest the sidebar may get: most of the window, so the main area never vanishes. */
function maxWidth() {
  return Math.max(MIN_WIDTH, Math.min(720, window.innerWidth * 0.6));
}

export function clampSidebarWidth(width: number) {
  return Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, width)));
}

/** The draggable right edge of the sidebar. */
export function SidebarResizer() {
  const width = useUiStore((s) => s.sidebarWidth);
  const setWidth = useUiStore((s) => s.setSidebarWidth);
  // Width at press time and pointer offset, so the edge tracks the pointer
  // from wherever it was grabbed.
  const start = useRef<{ x: number; width: number } | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, width };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setWidth(clampSidebarWidth(start.current.width + e.clientX - start.current.x));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    start.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // Held keys fire faster than re-renders; step from the stored width,
      // not this render's, or repeats would all land on the same value.
      const current = useUiStore.getState().sidebarWidth;
      setWidth(clampSidebarWidth(current + (e.key === "ArrowRight" ? KEY_STEP : -KEY_STEP)));
    }
  }

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      tabIndex={0}
      title="Drag to resize - double-click to reset"
      // A 7px grab area straddling the sidebar's border, highlighted on
      // hover and keyboard focus.
      className="absolute inset-y-0 -right-[4px] z-20 w-[7px] cursor-col-resize transition-colors hover:bg-accent/60 focus:outline-none focus-visible:bg-accent"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setWidth(DEFAULT_SIDEBAR_WIDTH)}
      onKeyDown={onKeyDown}
    />
  );
}
