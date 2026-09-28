import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in a fixed strip between the header and the body, e.g. tabs. */
  subheader?: ReactNode;
  /** Rendered in a fixed bar below the scrollable body. */
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
}

export function Modal({
  title,
  onClose,
  children,
  subheader,
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
      className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 [:root[data-theme=light]_&]:bg-[#1e1f22]/30"
      // mousedown (not click) so a drag that starts inside and ends on the
      // backdrop doesn't close the dialog
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-pop flex max-h-full w-full ${width} flex-col overflow-hidden rounded-xl border border-line bg-editor shadow-overlay`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-2.5 border-b border-line pl-[18px] pr-2.5">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {subheader && <div className="shrink-0 border-b border-line">{subheader}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[18px]">{children}</div>

        {footer && (
          <div className="flex min-h-14 shrink-0 items-center border-t border-line pl-[18px] pr-3.5">
            <div className="w-full">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
