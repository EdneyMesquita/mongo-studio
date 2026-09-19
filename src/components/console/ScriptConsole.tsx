import Editor from "@monaco-editor/react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import { useConsoleStore } from "../../store/consoleStore";
import { ConsoleOutput } from "./ConsoleOutput";

export function ScriptConsole() {
  const session = useConnectionsStore((s) => s.session);
  const selectedDatabase = useSessionsStore((s) => s.selectedDatabase);
  const { script, running, setScript, cancel } = useConsoleStore();

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Connect to a database to use the script console
      </div>
    );
  }

  const database = selectedDatabase ?? session.databases[0]?.name;

  // Reads fresh state rather than closing over `database`/`session`, since
  // this also gets bound once as a Monaco editor command at mount time.
  function handleRun() {
    const currentSession = useConnectionsStore.getState().session;
    const currentDatabase =
      useSessionsStore.getState().selectedDatabase ?? currentSession?.databases[0]?.name;
    if (!currentSession || !currentDatabase) return;
    useConsoleStore.getState().run(currentSession.sessionId, currentDatabase);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
        <span>
          Script console
          {database ? (
            <span className="ml-2 font-mono text-neutral-300">{database}</span>
          ) : (
            <span className="ml-2 text-amber-400">select a database first</span>
          )}
        </span>
        <div className="flex gap-2">
          {running ? (
            <button
              type="button"
              className="rounded bg-neutral-800 px-3 py-1 text-neutral-200 hover:bg-neutral-700"
              onClick={() => cancel()}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={!database}
              className="rounded bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
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
            language="javascript"
            theme="vs-dark"
            value={script}
            onChange={(value) => setScript(value ?? "")}
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
        <div className="min-h-[150px] flex-1 border-t border-neutral-800 md:h-full md:w-96 md:border-l md:border-t-0">
          <ConsoleOutput />
        </div>
      </div>
    </div>
  );
}
