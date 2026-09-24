import { useRef } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

interface SplitPaneProps {
  /** "horizontal" puts the panes side by side; "vertical" stacks them. */
  direction: "horizontal" | "vertical";
  first: ReactNode;
  second: ReactNode;
  /** Share of the space the first pane takes, 0 to 1. */
  ratio: number;
  onRatioChange: (ratio: number) => void;
  /** Smallest size, in px, either pane can be dragged down to. */
  minSize?: number;
  /** Ratio a double-click on the divider resets to. */
  defaultRatio?: number;
  ariaLabel: string;
}

const KEY_STEP = 0.02;

/** Two panes with a divider that can be dragged, or moved with the arrow keys. */
export function SplitPane({
  direction,
  first,
  second,
  ratio,
  onRatioChange,
  minSize = 100,
  defaultRatio = 0.5,
  ariaLabel,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Held keys fire faster than re-renders; stepping from the prop would
  // repeat the same value, so steps build on the latest one set here.
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  const horizontal = direction === "horizontal";

  function setRatio(next: number) {
    ratioRef.current = next;
    onRatioChange(next);
  }

  /** Keeps both panes at least minSize, when the container is big enough. */
  function clamp(next: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const total = rect ? (horizontal ? rect.width : rect.height) : 0;
    const min = total > minSize * 2 ? minSize / total : 0.1;
    return Math.min(1 - min, Math.max(min, next));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    // Captured, so the drag keeps tracking over the editor and outside the
    // window, and the editor doesn't start selecting text underneath.
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    const total = horizontal ? rect.width : rect.height;
    setRatio(clamp(offset / total));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const back = horizontal ? "ArrowLeft" : "ArrowUp";
    const forward = horizontal ? "ArrowRight" : "ArrowDown";
    if (e.key === back || e.key === forward) {
      e.preventDefault();
      setRatio(clamp(ratioRef.current + (e.key === forward ? KEY_STEP : -KEY_STEP)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setRatio(clamp(e.key === "Home" ? 0 : 1));
    }
  }

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 flex-1 ${horizontal ? "flex-row" : "flex-col"}`}
    >
      <div className="min-h-0 min-w-0" style={{ flex: `0 0 ${ratio * 100}%` }}>
        {first}
      </div>
      <div
        role="separator"
        aria-label={ariaLabel}
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        title="Drag to resize - double-click to reset"
        className={`group relative shrink-0 bg-border-subtle focus:outline-none ${
          horizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setRatio(clamp(defaultRatio))}
        onKeyDown={onKeyDown}
      >
        {/* A wider invisible grab area around the 1px line, highlighted on
            hover, drag and keyboard focus. */}
        <span
          className={`absolute z-10 transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${
            horizontal ? "inset-y-0 -left-[3px] w-[7px]" : "inset-x-0 -top-[3px] h-[7px]"
          }`}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1">{second}</div>
    </div>
  );
}
