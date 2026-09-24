import type { ConsoleSession } from "../../store/consoleStore";
import { JsonTree } from "../json/JsonTree";
import { JsonTable } from "../json/JsonTable";
import { useUiStore } from "../../store/uiStore";

export function ConsoleOutput({ session }: { session: ConsoleSession | undefined }) {
  const logs = session?.logs ?? [];
  const { result, hasResult = false, error = null, running = false } = session ?? {};
  const resultView = useUiStore((s) => s.resultView);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 font-mono text-xs">
      {logs.length === 0 && !hasResult && !error && !running && (
        <p className="p-2 text-text-faint">
          Output from console.log(...) and the script's result will show here.
        </p>
      )}
      {logs.map((line, i) => (
        <pre key={i} className="whitespace-pre-wrap text-text-muted">
          {line}
        </pre>
      ))}
      {running && <p className="text-text-muted">Running…</p>}
      {error && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-red-950 p-2 text-red-300">
          {error}
        </pre>
      )}
      {hasResult && (
        <div className="mt-2 rounded bg-panel">
          {resultView === "table" ? (
            <JsonTable value={result} />
          ) : (
            <JsonTree value={result} className="p-2" />
          )}
        </div>
      )}
    </div>
  );
}
