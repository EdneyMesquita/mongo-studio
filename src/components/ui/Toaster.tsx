import { CircleAlert, CircleCheck } from "lucide-react";
import { useToastStore } from "../../store/toastStore";

/** Confirmations stacked above the status bar, bottom-right. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[70] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="surface-overlay animate-pop pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg px-3.5 py-2.5"
          onClick={() => dismiss(t.id)}
        >
          {t.tone === "ok" ? (
            <CircleCheck size={16} className="mt-px shrink-0 text-ok" />
          ) : (
            <CircleAlert size={16} className="mt-px shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <div className="text-fg">{t.title}</div>
            {t.detail && <div className="text-xs text-fg-2">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
