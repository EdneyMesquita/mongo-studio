import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in a fixed bar below the scrollable body. */
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-md",
}: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      // mousedown (not click) so a drag that starts inside and ends on the
      // backdrop doesn't close the dialog
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-full w-full ${width} flex-col overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-default">{title}</h2>
          <button
            type="button"
            className="rounded p-1 text-text-muted hover:bg-panel-hover hover:text-text-default"
            onClick={onClose}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-border-subtle px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
