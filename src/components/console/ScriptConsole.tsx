import { useEffect, useMemo } from "react";
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
import { useAssistantStore } from "../../store/assistantStore";
import { InlineAskStrip } from "../assistant/InlineAskStrip";

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
  const ask = useAssistantStore((s) => (s.inline[key]?.kind === "script" ? s.inline[key] : undefined));
  const reviewOriginal = ask?.state === "review" ? ask.original : null;
  const reviewText = ask?.state === "review" ? ask.proposal : null;
  const proposal = useMemo(
    () => (reviewOriginal !== null && reviewText !== null ? { original: reviewOriginal, text: reviewText } : null),
    [reviewOriginal, reviewText],
  );

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
    // Not while a proposal waits for Accept or Reject.
    if (useAssistantStore.getState().inline[key]?.kind === "script") return;
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
      {ask && <InlineAskStrip tab={tab} ask={ask} />}
      <SplitPane
        direction={layout === "side" ? "horizontal" : "vertical"}
        ratio={split}
        onRatioChange={(ratio) => setSplit(layout, ratio)}
        defaultRatio={DEFAULT_CONSOLE_SPLIT}
        ariaLabel="Resize editor and output"
        first={
          <ConsoleEditor
            consoleKey={key}
            script={script}
            onRun={handleRun}
            proposal={proposal}
          />
        }
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
