import { useContext, useState } from "react";
import { editKindOf, isEditablePath } from "../../lib/valueEdit";
import type { EditKind } from "../../lib/valueEdit";
import { ValueEditContext } from "./ValueEditContext";

export interface ValueEdit {
  /** Whether this value can be edited in place here at all. */
  editable: boolean;
  editing: boolean;
  kind: EditKind | null;
  begin: () => void;
  cancel: () => void;
  /** Writes the parsed value; rejects with the backend's message. */
  save: (value: unknown) => Promise<void>;
}

/** Edit state of one value of a document, shared by grid cells and tree rows. */
export function useValueEdit(value: unknown, doc: unknown, path: string[]): ValueEdit {
  const editor = useContext(ValueEditContext);
  const [editing, setEditing] = useState(false);
  const kind = editKindOf(value);
  const editable = editor !== null && kind !== null && isEditablePath(path);

  return {
    editable,
    editing: editable && editing,
    kind,
    begin: () => {
      // the double-click also selected a word; the input selects its own
      window.getSelection()?.removeAllRanges();
      setEditing(true);
    },
    cancel: () => setEditing(false),
    save: async (next) => {
      if (!editor) return;
      await editor.commit(doc, path, next);
      setEditing(false);
    },
  };
}
