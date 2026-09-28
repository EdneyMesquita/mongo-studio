import { useCallback, useMemo, useState } from "react";
import { documentKey } from "../../lib/bsonFormat";

interface Selection {
  index: number;
  /** The selected document's `documentKey`, to find it again in new results. */
  key: string | null;
  /** The result page it was selected in. */
  documents: unknown[];
}

// Per tab, outliving the results pane: switching to Indexes and back keeps it.
const remembered = new Map<string, Selection>();

function resolve(selection: Selection | null, documents: unknown[]): number | null {
  if (documents.length === 0) return null;
  if (selection === null) return 0;
  if (selection.documents === documents) {
    return selection.index < documents.length ? selection.index : 0;
  }
  // New results (an in-place edit replaces the page too): follow the same
  // document if it is still there, otherwise start over at the first row.
  if (selection.key === null) return 0;
  const found = documents.findIndex((d) => documentKey(d) === selection.key);
  return found === -1 ? 0 : found;
}

/** The grid's selected row for a tab, and a setter; the first row until one is picked. */
export function useDocumentSelection(
  tabId: string,
  documents: unknown[],
): [number | null, (index: number) => void] {
  const [selection, setSelection] = useState<Selection | null>(
    () => remembered.get(tabId) ?? null,
  );
  const index = useMemo(() => resolve(selection, documents), [selection, documents]);
  const select = useCallback(
    (i: number) => {
      const next = { index: i, key: documentKey(documents[i]), documents };
      remembered.set(tabId, next);
      setSelection(next);
    },
    [tabId, documents],
  );
  return [index, select];
}
