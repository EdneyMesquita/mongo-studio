import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { editKindOf, editText, isEditablePath, parseEdit } from "../../lib/valueEdit";
import type { EditKind } from "../../lib/valueEdit";

export interface ValueEditor {
  /** Writes `value` (Extended JSON) at `path` in `doc`; rejects with a message. */
  commit: (doc: unknown, path: string[], value: unknown) => Promise<void>;
}

/**
 * Present only where values can be written back - Browse results that came
 * from a find. Without it (console output, aggregate results) every value
 * renders read-only.
 */
export const ValueEditContext = createContext<ValueEditor | null>(null);

interface EditableValueProps {
  value: unknown;
  /** The top-level document the value belongs to. */
  doc: unknown;
  /** Field path from the document root, e.g. ["props", "path"]. */
  path: string[];
  /** Read-only rendering of the value. */
  children: ReactNode;
  /** Take the full width, as in a table cell, instead of flowing inline. */
  block?: boolean;
}

/** Shows a value, and an editor for it on double-click where it can be saved. */
export function EditableValue({ value, doc, path, children, block = false }: EditableValueProps) {
  const editor = useContext(ValueEditContext);
  const [editing, setEditing] = useState(false);
  const kind = editKindOf(value);

  if (!editor || kind === null || !isEditablePath(path)) return <>{children}</>;

  if (editing) {
    return (
      <ValueInput
        initial={editText(value, kind)}
        kind={kind}
        block={block}
        onCancel={() => setEditing(false)}
        onSave={async (next) => {
          await editor.commit(doc, path, next);
          setEditing(false);
        }}
      />
    );
  }

  const Wrapper = block ? "div" : "span";
  return (
    <Wrapper
      className="cursor-text rounded-sm hover:bg-text-default/10"
      title="Double-click to edit"
      onDoubleClick={(e) => {
        e.stopPropagation();
        // the double-click also selected a word; the input selects its own
        window.getSelection()?.removeAllRanges();
        setEditing(true);
      }}
    >
      {children}
    </Wrapper>
  );
}

interface ValueInputProps {
  initial: string;
  kind: EditKind;
  block: boolean;
  onCancel: () => void;
  onSave: (value: unknown) => Promise<void>;
}

function ValueInput({ initial, kind, block, onCancel, onSave }: ValueInputProps) {
  // An <input> strips newlines from its value, so a multi-line string saved
  // through one would lose them even if only one letter changed.
  const multiline = kind === "string" && initial.includes("\n");
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  async function save() {
    if (saving) return;
    if (text === initial) {
      onCancel(); // nothing changed: no write
      return;
    }
    const parsed = parseEdit(text, kind);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.value);
    } catch (e) {
      setError(String(e));
      setSaving(false);
      ref.current?.focus();
    }
  }

  const fieldClass = `rounded border bg-editor px-1.5 py-0.5 font-mono text-xs text-text-default focus:outline-none ${
    error ? "border-red-500" : "border-accent"
  }`;
  const common = {
    ref,
    value: text,
    // readOnly, not disabled: a disabled field drops focus mid-save
    readOnly: saving,
    spellCheck: false,
    "aria-invalid": error !== null,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      setError(null);
    },
    onKeyDown: (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    },
    // Leaving the field abandons the edit rather than writing it: a write to
    // the database should take a deliberate Enter or click.
    onBlur: () => {
      if (!saving) onCancel();
    },
  };

  return (
    <span className={`${block ? "flex w-full" : "inline-flex max-w-full"} items-start gap-1 align-top`}>
      <span className="flex min-w-0 flex-1 flex-col">
        {multiline ? (
          <textarea
            {...common}
            rows={Math.min(8, text.split("\n").length + 1)}
            className={`${fieldClass} w-full resize-y`}
          />
        ) : (
          <input
            {...common}
            className={`${fieldClass} ${block ? "w-full" : ""}`}
            // inline editors grow with their text, within the row
            style={block ? undefined : { width: `${Math.max(14, text.length + 2)}ch` }}
          />
        )}
        {error && <span className="mt-0.5 whitespace-normal text-[11px] text-red-400">{error}</span>}
      </span>
      <button
        type="button"
        title={multiline ? "Save (Ctrl+Enter)" : "Save (Enter)"}
        aria-label="Save value"
        disabled={saving}
        className="shrink-0 rounded border border-accent bg-accent px-1 py-0.5 text-white hover:bg-accent-hover disabled:opacity-60"
        // keep focus in the field, or its blur would cancel before the click lands
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => save()}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
    </span>
  );
}
