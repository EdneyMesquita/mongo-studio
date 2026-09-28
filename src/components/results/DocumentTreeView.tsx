import type { CollectionTab } from "../../store/sessionsStore";
import { DocumentTreeEntry } from "./DocumentTreeEntry";

interface DocumentTreeViewProps {
  tab: CollectionTab;
  documents: unknown[];
}

/** The result page as a tree: one collapsible entry per document. */
export function DocumentTreeView({ tab, documents }: DocumentTreeViewProps) {
  return (
    <div
      role="tree"
      aria-label={`Documents in ${tab.database}.${tab.collection}`}
      className="min-h-0 flex-1 overflow-auto pt-1 pb-4 font-data"
    >
      {documents.map((doc, i) => (
        <DocumentTreeEntry
          key={i}
          doc={doc}
          index={i}
          collectionName={tab.collection}
          tabId={tab.id}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}
