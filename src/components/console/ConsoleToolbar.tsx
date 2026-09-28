import { Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { Tab } from "../../store/sessionsStore";
import { useScriptsStore } from "../../store/scriptsStore";
import { ConsoleLayoutToggle } from "./ConsoleLayoutToggle";
import { ConsoleTargetPill } from "./ConsoleTargetPill";
import { ScriptFileChip } from "./ScriptFileChip";

interface ConsoleToolbarProps {
  tab: Tab;
  dirty: boolean;
  running: boolean;
  onRun: () => void;
  onCancel: () => void;
}

/** Where the script runs, the file it saves to, layout, Save and Run. */
export function ConsoleToolbar({ tab, dirty, running, onRun, onCancel }: ConsoleToolbarProps) {
  const key = tab.id;
  const file = useScriptsStore((s) => s.files[key]);
  const saving = useScriptsStore((s) => s.saving);
  const saveError = useScriptsStore((s) => s.saveError);
  const saveScript = useScriptsStore((s) => s.save);
  const detach = useScriptsStore((s) => s.detach);

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2.5">
      <ConsoleTargetPill tab={tab} />
      <ScriptFileChip file={file} dirty={dirty} onDetach={() => detach(key)} />
      {saveError && (
        <span className="shrink-0 text-sm text-danger" title={saveError} role="alert">
          Save failed
        </span>
      )}
      <span className="flex-1" />
      <ConsoleLayoutToggle />
      <Button
        variant="ghost"
        disabled={saving}
        title="Save (Ctrl S). Save as a new file: Ctrl Shift S"
        aria-label="Save"
        onClick={() => saveScript()}
      >
        <Save />
        <span className="max-sm:hidden">Save</span>
      </Button>
      {running ? (
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button variant="primary" onClick={onRun}>
          <Play />
          Run
          <Kbd>Ctrl ⏎</Kbd>
        </Button>
      )}
    </div>
  );
}
