import Editor from "@monaco-editor/react";
import { useConnectionsStore } from "../../store/connectionsStore";
import {
  selectActiveTab,
  selectCurrentDatabase,
  useSessionsStore,
} from "../../store/sessionsStore";
import { NO_TAB_CONSOLE, defaultScript, useConsoleStore } from "../../store/consoleStore";
import { useThemeStore } from "../../store/themeStore";
import { isLightTheme } from "../../lib/themes";
import { ConsoleOutput } from "./ConsoleOutput";
import { ResultViewToggle } from "../json/ResultViewToggle";

/**
 * Which console to show and run: the active tab's, scoped to its collection,
 * or the shared one while no tab is open. Read from the stores at call time,
 * because the run command is bound into Monaco once, at mount.
 */
function currentTarget() {
  const session = useConnectionsStore.getState().session;
  const sessions = useSessionsStore.getState();
  const tab = selectActiveTab(sessions);
  const database = selectCurrentDatabase(sessions) ?? session?.databases[0]?.name ?? null;
  const key = tab?.id ?? NO_TAB_CONSOLE;
  const stored = useConsoleStore.getState().consoles[key]?.script;
  return {
    session,
    database,
    key,
    script: stored ?? defaultScript(database, tab?.collection ?? null),
  };
}

export function ScriptConsole() {
  const session = useConnectionsStore((s) => s.session);
  const activeTab = useSessionsStore(selectActiveTab);
  const currentDatabase = useSessionsStore(selectCurrentDatabase);
  const themeId = useThemeStore((s) => s.themeId);

  const key = activeTab?.id ?? NO_TAB_CONSOLE;
  const consoleSession = useConsoleStore((s) => s.consoles[key]);
  const setScript = useConsoleStore((s) => s.setScript);
  const cancel = useConsoleStore((s) => s.cancel);

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Connect to a database to use the script console
      </div>
    );
  }

  const database = currentDatabase ?? session.databases[0]?.name ?? null;
  const script =
    consoleSession?.script ?? defaultScript(database, activeTab?.collection ?? null);
  const running = consoleSession?.running ?? false;

  function handleRun() {
    const target = currentTarget();
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
        </span>
        <div className="flex items-center gap-2">
          <ResultViewToggle />
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
