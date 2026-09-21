import { ListTree, Table2 } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import type { ResultView } from "../../store/uiStore";

const options: { id: ResultView; label: string; Icon: typeof ListTree }[] = [
  { id: "tree", label: "Tree view", Icon: ListTree },
  { id: "table", label: "Table view", Icon: Table2 },
];

/** Switches every result pane at once - Browse and the console share it. */
export function ResultViewToggle() {
  const resultView = useUiStore((s) => s.resultView);
  const setResultView = useUiStore((s) => s.setResultView);

  return (
    <div className="flex overflow-hidden rounded border border-border-subtle">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={resultView === id}
          className={`px-2 py-1 ${
            resultView === id
              ? "bg-panel-alt text-text-default"
              : "text-text-muted hover:bg-panel-hover hover:text-text-default"
          }`}
          onClick={() => setResultView(id)}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}
