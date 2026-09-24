import { JsonTree } from "../json/JsonTree";
import { DocumentActions } from "./DocumentActions";

interface DocumentCardProps {
  doc: unknown;
  collectionName: string;
  tabId: string;
}

export function DocumentCard({ doc, collectionName, tabId }: DocumentCardProps) {
  return (
    <div className="group relative rounded border border-border-subtle bg-panel">
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <DocumentActions doc={doc} collectionName={collectionName} tabId={tabId} />
      </div>
      <JsonTree value={doc} className="p-2 pr-16" />
    </div>
  );
}
