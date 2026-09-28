import { Play, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { Tab } from "../../store/sessionsStore";
import { useScriptsStore } from "../../store/scriptsStore";
import { ConsoleLayoutToggle } from "./ConsoleLayoutToggle";
import { ConsoleTargetPill } from "./ConsoleTargetPill";
import { ScriptFileChip } from "./ScriptFileChip";
import { FromAssistantTag } from "../query/QueryBar";
import { useAssistantStore } from "../../store/assistantStore";

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
  const askInline = useAssistantStore((s) => s.askInline);
  // A proposal waiting for Accept or Reject is the bar's one primary.
  const pending = useAssistantStore((s) => s.inline[key]?.kind === "script");

  return (
    // A container: with the Assistant open the editor narrows, and the
    // bar sheds labels and the layout switch before the target gets cut.
    <div className="@container flex h-9 shrink-0 items-center gap-2 border-b border-line px-2.5">
      <ConsoleTargetPill tab={tab} />
      <ScriptFileChip file={file} dirty={dirty} onDetach={() => detach(key)} />
      {tab.kind === "console" && tab.fromAssistant && <FromAssistantTag />}
      {saveError && (
        <span className="shrink-0 text-sm text-danger" title={saveError} role="alert">
          Save failed
        </span>
      )}
      <span className="flex-1" />
      <span className="contents @max-[820px]:hidden">
        <ConsoleLayoutToggle />
      </span>
      <Button
        variant="ghost"
        title="Ask the Assistant to change this script (Ctrl I)"
        aria-label="Ask the Assistant"
        onClick={askInline}
      >
        <Sparkles />
        <span className="@max-[760px]:hidden">Ask</span>
      </Button>
      <Button
        variant="ghost"
        disabled={saving}
        title="Save (Ctrl S). Save as a new file: Ctrl Shift S"
        aria-label="Save"
        onClick={() => saveScript()}
      >
        <Save />
        <span className="max-sm:hidden @max-[760px]:hidden">Save</span>
      </Button>
      {running ? (
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button
          variant={pending ? "secondary" : "primary"}
          disabled={pending}
          title={pending ? "Accept or reject the proposal first" : undefined}
          onClick={onRun}
        >
          <Play />
          Run
          <Kbd>Ctrl ⏎</Kbd>
        </Button>
      )}
    </div>
  );
}
