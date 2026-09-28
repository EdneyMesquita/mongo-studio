import type { ConsoleSession } from "../../store/consoleStore";
import { useUiStore } from "../../store/uiStore";
import { isDocumentList } from "../../lib/bsonFormat";
import { DocumentTable } from "../grid/DocumentTable";
import { JsonText } from "../json/JsonText";
import { JsonTree } from "../json/JsonTree";
import { ResultsError } from "../results/ResultsError";

/** A script's result in the shared result view: grid (documents only), tree or JSON. */
function ConsoleResult({ value }: { value: unknown }) {
  const resultView = useUiStore((s) => s.resultView);
  if (resultView === "grid" && isDocumentList(value)) {
    return <DocumentTable documents={value} aria-label="Script result" className="flex-1" />;
  }
  if (resultView === "json") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <JsonText value={value} />
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto pt-1 pb-4">
      <JsonTree value={value} defaultOpenDepth={1} aria-label="Script result" />
    </div>
  );
}

/**
 * The Result tab of a console's output: the script's result, its error, or
 * that it is still running. The console pane renders the tabs, logs and
 * timing around it. Always read-only.
 */
export function ConsoleOutput({ session }: { session: ConsoleSession | undefined }) {
  const { result, hasResult = false, error = null, running = false } = session ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && <ResultsError message={error} />}
      {running && !hasResult && <p className="px-3.5 py-2.5 text-fg-2">Running…</p>}
      {hasResult && <ConsoleResult value={result} />}
    </div>
  );
}
