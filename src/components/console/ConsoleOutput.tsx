import { useConsoleStore } from "../../store/consoleStore";
import { JsonTree } from "../json/JsonTree";

export function ConsoleOutput() {
  const { logs, result, hasResult, error, running } = useConsoleStore();

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
        <div className="mt-2 rounded bg-panel p-2">
          <JsonTree value={result} />
        </div>
      )}
    </div>
  );
}
