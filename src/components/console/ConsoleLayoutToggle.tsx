import { Columns2, Rows2 } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import type { ConsoleLayout } from "../../store/uiStore";

const options: { id: ConsoleLayout; label: string; Icon: typeof Columns2 }[] = [
  { id: "side", label: "Editor and output side by side", Icon: Columns2 },
  { id: "stacked", label: "Editor above output", Icon: Rows2 },
];

/** Switches the console between side-by-side and stacked panes. */
export function ConsoleLayoutToggle() {
  const layout = useUiStore((s) => s.consoleLayout);
  const setLayout = useUiStore((s) => s.setConsoleLayout);

  return (
    <div className="flex overflow-hidden rounded border border-border-subtle">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={layout === id}
          className={`px-2 py-1 ${
            layout === id
              ? "bg-panel-alt text-text-default"
              : "text-text-muted hover:bg-panel-hover hover:text-text-default"
          }`}
          onClick={() => setLayout(id)}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
