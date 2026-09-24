import { useEffect } from "react";
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
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[200px] flex-1 md:h-full">
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
            }}
            onMount={(editor, monaco) => {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                handleRun,
              );
            }}
          />
        </div>
        <div className="min-h-[150px] flex-1 border-t border-border-subtle md:h-full md:w-96 md:border-l md:border-t-0">
          <ConsoleOutput session={consoleSession} />
        </div>
      </div>
    </div>
  );
}
