import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentIdText, documentKey } from "../../lib/bsonFormat";
import { isPlainObject } from "../../lib/bsonValue";
import { DocumentActions } from "../grid/DocumentActions";
import { JsonTree } from "../json/JsonTree";

/** The tallest a document opened under its row gets before it scrolls. */
const MAX_HEIGHT = 320;

interface InlineDocumentProps {
  doc: unknown;
  index: number;
  /** The grid's visible width: the document stays in view while the grid scrolls sideways. */
  width: number;
  collectionName: string;
  tabId: string;
  onClose: () => void;
}

/**
 * The whole document under its row, in a pane too narrow for the inspector:
 * the same tree, copy and edit-in-console as the inspector, capped in height
 * so the rows after it stay in sight.
 */
export function InlineDocument({ doc, index, width, collectionName, tabId, onClose }: InlineDocumentProps) {
  const id = documentIdText(doc);
  const fields = isPlainObject(doc) ? Object.keys(doc).length : 0;
  return (
    <section
      aria-label={`Document ${index + 1}`}
      className="sticky left-0 flex animate-in flex-col font-sans duration-150 fade-in-0 slide-in-from-top-1"
      style={{ width: width || undefined, maxHeight: MAX_HEIGHT }}
    >
      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line-soft pr-1 pl-3">
        <h3 className="text-sm font-semibold text-fg">Document {index + 1}</h3>
        <span className="min-w-0 truncate font-mono text-xs text-fg-3" title={id ?? undefined}>
          {id}
        </span>
        <span className="mr-auto shrink-0 text-xs text-fg-3">
          {fields} field{fields === 1 ? "" : "s"}
        </span>
        <DocumentActions doc={doc} collectionName={collectionName} tabId={tabId} />
        <Button variant="ghost" size="icon-sm" title="Close (Esc)" aria-label="Close the document" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto pt-1 pb-2">
        <JsonTree key={documentKey(doc) ?? undefined} value={doc} defaultOpenDepth={1} aria-label="Document fields" />
      </div>
    </section>
  );
}
