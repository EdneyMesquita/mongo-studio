import { useEffect } from "react";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { Tab } from "../../store/sessionsStore";
import { defaultScript, useConsoleStore } from "../../store/consoleStore";
import { hasUnsavedEdits, useScriptsStore } from "../../store/scriptsStore";
import { DEFAULT_CONSOLE_SPLIT, useUiStore } from "../../store/uiStore";
import { SplitPane } from "../ui/SplitPane";
import { ConsoleEditor } from "./ConsoleEditor";
import { ConsoleOutputPane } from "./ConsoleOutputPane";
import { ConsoleToolbar } from "./ConsoleToolbar";
import { runCurrentConsole, useRunDuration } from "./useTimedRun";

/** The script console of a tab: a console tab, or a collection tab's own. */
export function ScriptConsole({ tab }: { tab: Tab }) {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);

  const key = tab.id;
  const consoleSession = useConsoleStore((s) => s.consoles[key]);
  const cancel = useConsoleStore((s) => s.cancel);
  const file = useScriptsStore((s) => s.files[key]);
  const layout = useUiStore((s) => s.consoleLayout);
  const split = useUiStore((s) => s.consoleSplit[s.consoleLayout]);
  const setSplit = useUiStore((s) => s.setConsoleSplit);
  const durationMs = useRunDuration(key);

  // Ctrl/Cmd+S saves, adding Shift saves to a new file. On the window rather
  // than as a Monaco command so it also works with the editor unfocused;
  // Monaco has no binding of its own for it, so the event still gets here.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      useScriptsStore.getState().save(e.shiftKey);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!session) return null;

  const untouched = defaultScript(tab.database, tab.collection);
  const script = consoleSession?.script ?? untouched;
  const running = consoleSession?.running ?? false;

  function handleRun() {
    void runCurrentConsole();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ConsoleToolbar
        tab={tab}
        dirty={hasUnsavedEdits(script, file, untouched)}
        running={running}
        onRun={handleRun}
        onCancel={() => cancel(key)}
      />
      <SplitPane
        direction={layout === "side" ? "horizontal" : "vertical"}
        ratio={split}
        onRatioChange={(ratio) => setSplit(layout, ratio)}
        defaultRatio={DEFAULT_CONSOLE_SPLIT}
        ariaLabel="Resize editor and output"
        first={<ConsoleEditor consoleKey={key} script={script} onRun={handleRun} />}
        second={
          <ConsoleOutputPane
            session={consoleSession}
            durationMs={durationMs}
            exportLabel={tab.kind === "collection" ? `${tab.database}.${tab.collection} console` : `${tab.database} console`}
            exportName={`${tab.database}-result`}
          />
        }
      />
    </div>
  );
}
