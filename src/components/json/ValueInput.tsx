import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { editHint, parseEdit } from "../../lib/valueEdit";
import type { EditKind } from "../../lib/valueEdit";

interface ValueInputProps {
  initial: string;
  kind: EditKind;
  /** The field being edited, for the input's accessible name. */
  field: string;
  /** "cell" fills a grid cell; "inline" sits in a tree row. */
  variant: "cell" | "inline";
  onCancel: () => void;
  onSave: (value: unknown) => Promise<void>;
}

const INPUT_MODES: Partial<Record<EditKind, "decimal" | "numeric">> = {
  number: "decimal",
  decimal: "decimal",
  long: "numeric",
};

/** A type-aware editor for one value: Enter saves, Esc or leaving cancels. */
export function ValueInput({ initial, kind, field, variant, onCancel, onSave }: ValueInputProps) {
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

  const hint = editHint(kind);
  const common = {
    ref,
    value: text,
    // readOnly, not disabled: a disabled field drops focus mid-save
    readOnly: saving,
    spellCheck: false,
    title: multiline ? `${hint} - Ctrl+Enter saves` : hint,
    "aria-label": `Edit ${field}`,
    "aria-invalid": error !== null,
    "aria-busy": saving,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      setError(null);
    },
    onKeyDown: (e: KeyboardEvent) => {
      // keep arrows and Enter away from the grid and tree around the field
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
    // the database should take a deliberate Enter.
    onBlur: () => {
      if (!saving) onCancel();
    },
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onDoubleClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };

  const ring = error
    ? "shadow-[inset_0_0_0_2px_var(--color-danger)]"
    : "shadow-[inset_0_0_0_2px_var(--color-accent)]";
  const fieldClass = cn(
    "block bg-field font-data text-fg outline-none placeholder:text-fg-3",
    ring,
    saving && "opacity-70",
  );

  const input = multiline ? (
    <textarea
      {...common}
      rows={Math.min(8, text.split("\n").length + 1)}
      className={cn(
        fieldClass,
        "resize-y rounded-xs px-2 py-0.5",
        variant === "cell"
          ? "absolute top-0 left-0 z-10 w-[max(100%,320px)] shadow-overlay"
          : "w-full",
      )}
    />
  ) : (
    <input
      {...common}
      inputMode={INPUT_MODES[kind]}
      placeholder={kind === "date" ? "2026-09-23T14:30:00Z" : undefined}
      className={cn(
        fieldClass,
        "w-full",
        variant === "cell" ? "h-6 px-[9px]" : "h-5 rounded-xs px-1",
      )}
    />
  );

  return (
    <span className={cn("block", variant === "cell" && "relative h-6")}>
      {input}
      {error && (
        <span
          role="alert"
          className={cn(
            "block font-sans text-xs whitespace-normal text-danger",
            variant === "cell"
              ? "absolute top-full left-0 z-20 mt-0.5 w-max max-w-[280px] rounded-md border border-line bg-popover px-2 py-1 shadow-overlay"
              : "mt-0.5",
          )}
        >
          {error}
        </span>
      )}
    </span>
  );
}
