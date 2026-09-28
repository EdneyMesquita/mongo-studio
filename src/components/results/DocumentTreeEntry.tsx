import { useState } from "react";
import { countLabel, documentLabel, objectIdHex } from "../../lib/bsonFormat";
import { isPlainObject } from "../../lib/bsonValue";
import { DocumentActions } from "../grid/DocumentActions";
import { InlineValue } from "../json/InlineValue";
import { JsonTree } from "../json/JsonTree";
import { KvRow } from "../json/KvRow";

interface DocumentTreeEntryProps {
  doc: unknown;
  index: number;
  collectionName: string;
  tabId: string;
  defaultOpen: boolean;
}

/** How a document's _id reads in its tree header: ObjectId("…") like the shell. */
function DocumentId({ doc }: { doc: unknown }) {
  const id = isPlainObject(doc) ? doc._id : undefined;
  const hex = objectIdHex(id);
  if (hex !== null) {
    return (
      <>
        <span className="text-json-bson">ObjectId(</span>
        <span className="text-json-string">"{hex}"</span>
        <span className="text-json-bson">)</span>
      </>
    );
  }
  return id === undefined ? null : <InlineValue value={id} wrap={false} />;
}

/** One document in the tree view: a header row, and its fields while open. */
export function DocumentTreeEntry({ doc, index, collectionName, tabId, defaultOpen }: DocumentTreeEntryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const fieldCount = isPlainObject(doc) ? Object.keys(doc).length : 0;
  const label = documentLabel(doc);

  return (
    <>
      <KvRow
        depth={0}
        expanded={open}
        onToggle={() => setOpen((o) => !o)}
        label={<span className="text-fg">{index + 1}</span>}
        type={countLabel(fieldCount, "field")}
        valueClassName="truncate"
        actions={
          <DocumentActions doc={doc} collectionName={collectionName} tabId={tabId} size="icon-xs" />
        }
      >
        <DocumentId doc={doc} />
        {label && <span className="text-fg-3"> · {label}</span>}
      </KvRow>
      {open && <JsonTree value={doc} depth={1} defaultOpenDepth={1} truncate />}
    </>
  );
}
