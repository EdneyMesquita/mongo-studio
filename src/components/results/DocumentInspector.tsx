import { useContext } from "react";
import { Kbd } from "@/components/ui/kbd";
import { documentIdText, documentKey } from "../../lib/bsonFormat";
import { DocumentActions } from "../grid/DocumentActions";
import { JsonTree } from "../json/JsonTree";
import { ValueEditContext } from "../json/ValueEditContext";

interface DocumentInspectorProps {
  /** The selected document; undefined when nothing is selected. */
  doc: unknown;
  collectionName: string;
  tabId: string;
}

function InspectorFooter() {
  const editable = useContext(ValueEditContext) !== null;
  return (
    <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-line-soft px-3 py-[7px] text-xs text-fg-3">
      {editable ? (
        <>
          <span>Double-click a value to edit</span>
          <span>
            <Kbd>Enter</Kbd> saves
          </span>
          <span>
            <Kbd>Esc</Kbd> cancels
          </span>
        </>
      ) : (
        <span>Read-only results: values can't be edited here</span>
      )}
    </div>
  );
}

/**
 * The selected document as a typed key/value tree beside the grid, with its
 * copy and edit-in-console actions.
 */
export function DocumentInspector({ doc, collectionName, tabId }: DocumentInspectorProps) {
  if (doc === undefined) {
    return (
      <section aria-label="Document" className="flex h-full flex-col bg-editor">
        <p className="m-auto p-6 text-center text-fg-3">
          Select a document to see all of its fields.
        </p>
      </section>
    );
  }

  const id = documentIdText(doc);
  return (
    <section aria-label="Document" className="flex h-full min-h-0 flex-col bg-editor">
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line-soft pr-1.5 pl-3">
        <h2 className="text-base font-semibold text-fg">Document</h2>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-3" title={id ?? undefined}>
          {id}
        </span>
        <DocumentActions doc={doc} collectionName={collectionName} tabId={tabId} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto pt-1 pb-4">
        <JsonTree
          // a new tree per document, so expanded nodes don't carry over
          key={documentKey(doc) ?? undefined}
          value={doc}
          defaultOpenDepth={1}
          aria-label="Document fields"
        />
      </div>
      <InspectorFooter />
    </section>
  );
}
