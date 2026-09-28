import { memo } from "react";
import type { CollectionTab } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { JsonText } from "../json/JsonText";
import { ValueEditContext } from "../json/ValueEditContext";
import { DocumentGridView } from "./DocumentGridView";
import { DocumentTreeView } from "./DocumentTreeView";
import { ResultsError } from "./ResultsError";
import { ResultsHeader } from "./ResultsHeader";
import { useDocumentValueEditor } from "./useDocumentValueEditor";

interface ResultViewsProps {
  tab: CollectionTab;
  documents: unknown[];
}

/**
 * The views depend on the results and on which collection they came from,
 * never on the query text: typing in the filter changes the tab object on
 * every key, and must not re-render the grid and the inspector.
 */
function sameResults(a: ResultViewsProps, b: ResultViewsProps): boolean {
  return (
    a.documents === b.documents &&
    a.tab.id === b.tab.id &&
    a.tab.resultsMode === b.tab.resultsMode &&
    a.tab.database === b.tab.database &&
    a.tab.collection === b.tab.collection &&
    a.tab.connection === b.tab.connection
  );
}

const ResultViews = memo(function ResultViews({ tab, documents }: ResultViewsProps) {
  const resultView = useUiStore((s) => s.resultView);
  if (documents.length === 0) {
    return <p className="p-6 text-center text-fg-3">No documents match this query.</p>;
  }
  switch (resultView) {
    case "tree":
      return <DocumentTreeView tab={tab} documents={documents} />;
    case "json":
      return (
        <div className="min-h-0 flex-1 overflow-auto">
          <JsonText value={documents} />
        </div>
      );
    default:
      return <DocumentGridView tab={tab} documents={documents} />;
  }
}, sameResults);

/**
 * A collection tab's query results under its query bar: the results header,
 * the error, and the grid + inspector, tree or JSON view. Values edit in
 * place in find results.
 *
 * Memoised because every open tab may keep its results mounted: typing in
 * one tab's query must not re-render the others, whose tab objects are
 * unchanged.
 */
export const DocumentResults = memo(function DocumentResults({ tab }: { tab: CollectionTab }) {
  const valueEditor = useDocumentValueEditor(tab);
  const documents = tab.results?.documents;

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <ResultsHeader tab={tab} />
      {tab.error && <ResultsError message={tab.error} />}
      <ValueEditContext.Provider value={valueEditor}>
        {documents && <ResultViews tab={tab} documents={documents} />}
      </ValueEditContext.Provider>
    </div>
  );
});
