import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  /** Shortcut hint shown at the right, e.g. "Ctrl N". */
  shortcut?: string;
  /** Destructive: red, filling red on hover. */
  danger?: boolean;
}

/** A menu row: an action, a rule between groups, or a group heading. */
export type ContextMenuEntry = ContextMenuItem | { separator: true } | { heading: string };

interface ContextMenuProps {
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
  items: ContextMenuEntry[];
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
      className="surface-overlay animate-pop fixed z-[60] min-w-[220px] rounded-lg p-1"
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
      {items.map((item, i) => {
        if ("separator" in item) {
          return <hr key={`sep-${i}`} className="mx-0.5 my-1 border-0 border-t border-line" />;
        }
        if ("heading" in item) {
          return (
            <div key={`head-${i}`} className="truncate px-2 pb-1 pt-1.5 text-xs text-fg-3">
              {item.heading}
            </div>
          );
        }
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={`group flex h-7 w-full items-center gap-2 rounded-[5px] px-2 text-left outline-none disabled:cursor-default disabled:text-fg-3 ${
              item.danger
                ? "text-danger enabled:hover:bg-danger enabled:hover:text-white enabled:focus-visible:bg-danger enabled:focus-visible:text-white"
                : "text-fg enabled:hover:bg-accent enabled:hover:text-on-accent enabled:focus-visible:bg-accent enabled:focus-visible:text-on-accent"
            }`}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {Icon ? (
              <Icon
                size={14}
                className={`shrink-0 ${item.danger ? "" : "text-fg-2"} group-enabled:group-hover:text-current group-focus-visible:text-current`}
              />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="ml-4 text-xs text-fg-3 group-enabled:group-hover:text-current group-focus-visible:text-current">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
