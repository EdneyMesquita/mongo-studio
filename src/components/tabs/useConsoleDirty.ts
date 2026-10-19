import { defaultScript, useConsoleStore } from "../../store/consoleStore";
import { hasUnsavedEdits, useScriptsStore } from "../../store/scriptsStore";
import type { Tab } from "../../store/sessionsStore";
import { useTabEngine } from "../../store/settingsStore";
import { TabKind } from "../../store/sessionsStore";

/** Whether a console tab holds edits that aren't saved to its file. */
export function useConsoleDirty(tab: Tab): boolean {
  const script = useConsoleStore((s) =>
    tab.kind === TabKind.Console ? (s.consoles[tab.id]?.script ?? null) : null,
  );
  const file = useScriptsStore((s) => (tab.kind === TabKind.Console ? s.files[tab.id] : undefined));
  const engine = useTabEngine(tab.id);
  if (tab.kind !== TabKind.Console) return false;
  const untouched = defaultScript(tab.database, tab.collection, engine);
  return hasUnsavedEdits(script ?? untouched, file, untouched);
}
