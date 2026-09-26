import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Save, X } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import {
  selectActiveTab,
  selectCurrentDatabase,
  useSessionsStore,
} from "../../store/sessionsStore";
import {
  NO_TAB_CONSOLE,
  currentConsoleTarget,
  defaultScript,
  useConsoleStore,
} from "../../store/consoleStore";
import { hasUnsavedEdits, useScriptsStore } from "../../store/scriptsStore";
import { useThemeStore } from "../../store/themeStore";
import { isLightTheme } from "../../lib/themes";
import { ConsoleOutput } from "./ConsoleOutput";
import { ConsoleLayoutToggle } from "./ConsoleLayoutToggle";
import { SplitPane } from "../ui/SplitPane";
import { DEFAULT_CONSOLE_SPLIT, useUiStore } from "../../store/uiStore";
import { attachCompletion } from "../../lib/monacoCompletion";
import { addEditorCommand } from "../../lib/monaco";
import { ResultViewToggle } from "../json/ResultViewToggle";

export function ScriptConsole() {
  const session = useConnectionsStore((s) => s.session);
  const activeTab = useSessionsStore(selectActiveTab);
  const currentDatabase = useSessionsStore(selectCurrentDatabase);
  const themeId = useThemeStore((s) => s.themeId);

  const key = activeTab?.id ?? NO_TAB_CONSOLE;
  const consoleSession = useConsoleStore((s) => s.consoles[key]);
  const setScript = useConsoleStore((s) => s.setScript);
  const cancel = useConsoleStore((s) => s.cancel);
  const detachCompletion = useRef<(() => void) | null>(null);
  const layout = useUiStore((s) => s.consoleLayout);
  const split = useUiStore((s) => s.consoleSplit[s.consoleLayout]);
  const setSplit = useUiStore((s) => s.setConsoleSplit);

  useEffect(() => () => detachCompletion.current?.(), []);
  const file = useScriptsStore((s) => s.files[key]);
  const saving = useScriptsStore((s) => s.saving);
  const saveError = useScriptsStore((s) => s.saveError);
  const saveScript = useScriptsStore((s) => s.save);
  const detach = useScriptsStore((s) => s.detach);

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

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Connect to a database to use the script console
      </div>
    );
  }

  const database = currentDatabase ?? session.databases[0]?.name ?? null;
  const untouched = defaultScript(database, activeTab?.collection ?? null);
  const script = consoleSession?.script ?? untouched;
  const running = consoleSession?.running ?? false;

  function handleRun() {
    const target = currentConsoleTarget();
    if (!target.session || !target.database) return;
    useConsoleStore
      .getState()
      .run(target.key, target.session.sessionId, target.database, target.script);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 text-xs text-text-muted">
        <span>
          Script console
          {database ? (
            <span className="ml-2 font-mono text-text-default">
              {activeTab ? `${activeTab.database}.${activeTab.collection}` : database}
            </span>
          ) : (
            <span className="ml-2 text-amber-400">select a database first</span>
          )}
          <span
            className="ml-3 inline-flex items-center gap-1 rounded bg-panel-alt px-1.5 py-0.5 font-mono"
            title={file?.path ?? "Not saved yet"}
          >
            {file?.name ?? "untitled.js"}
            {hasUnsavedEdits(script, file, untouched) && (
              <span className="text-amber-400" aria-label="unsaved changes">
                ●
              </span>
            )}
            {file && (
              <button
                type="button"
                className="rounded text-text-faint hover:text-text-default"
                title={`Stop saving to ${file.name} - the next save asks for a file`}
                aria-label={`Stop saving to ${file.name}`}
                onClick={() => detach(key)}
              >
                <X size={11} />
              </button>
            )}
          </span>
          {saveError && (
            <span className="ml-2 text-red-400" title={saveError}>
              Save failed
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <ConsoleLayoutToggle />
          <ResultViewToggle />
          <button
            type="button"
            disabled={saving}
            className="flex items-center gap-1 rounded border border-border-subtle px-2.5 py-1 text-text-default hover:bg-panel-hover disabled:opacity-50"
            title="Save (⌘S). Save as a new file: ⇧⌘S"
            onClick={() => saveScript()}
          >
            <Save size={12} />
            Save
          </button>
          {running ? (
            <button
              type="button"
              className="rounded bg-panel-alt px-3 py-1 text-text-default hover:bg-panel-hover"
              onClick={() => cancel(key)}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={!database}
              className="rounded bg-run px-3 py-1 text-white hover:bg-run-hover disabled:opacity-50"
              onClick={handleRun}
            >
              Run (⌘⏎)
            </button>
          )}
        </div>
      </div>
      <SplitPane
        direction={layout === "side" ? "horizontal" : "vertical"}
        ratio={split}
        onRatioChange={(ratio) => setSplit(layout, ratio)}
        defaultRatio={DEFAULT_CONSOLE_SPLIT}
        ariaLabel="Resize editor and output"
        first={
          <div className="h-full">
            <Editor
              // Remounted per console rather than switched with `path`: the
              // wrapper applies a new `value` and a new `path` in separate
              // effects, so on a tab switch it wrote the incoming script into
              // the outgoing tab's model, cross-wiring the two buffers.
              key={key}
              language="javascript"
              theme={isLightTheme(themeId) ? "light" : "vs-dark"}
              value={script}
              onChange={(value) => setScript(key, value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                // follow the divider, not only the window
                automaticLayout: true,
              }}
              onMount={(editor, monaco) => {
                // The editor remounts per tab (key={key}); let go of the
                // previous tab's model before registering this one.
                detachCompletion.current?.();
                const model = editor.getModel();
                if (model) {
                  detachCompletion.current = attachCompletion(model, {
                    editor: "console",
                    // the collection comes from db.collection("…") in the text
                    context: () => {
                      const { session: current, database } = currentConsoleTarget();
                      return current && database
                        ? { sessionId: current.sessionId, database, collection: null }
                        : null;
                    },
                  });
                }
                addEditorCommand(editor, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handleRun);
              }}
            />
          </div>
        }
        second={<ConsoleOutput session={consoleSession} />}
      />
    </div>
  );
}
