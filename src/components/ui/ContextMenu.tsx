import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const EDGE_GAP = 4;

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Measure before paint and pull the menu back inside the window when the
  // click was near its right or bottom edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(y, window.innerHeight - height - EDGE_GAP)),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Scrolling or resizing moves what the menu was opened on.
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  function moveFocus(step: 1 | -1) {
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + step + buttons.length) % buttons.length].focus();
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] min-w-[180px] rounded-md border border-border-subtle bg-panel-alt py-1 shadow-xl"
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className="block w-full px-3 py-1.5 text-left text-xs text-text-default hover:bg-panel-hover focus:bg-panel-hover focus:outline-none disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
