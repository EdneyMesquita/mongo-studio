import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { editText } from "../../lib/valueEdit";
import { useValueEdit } from "./useValueEdit";
import { ValueInput } from "./ValueInput";

interface EditableValueProps {
  value: unknown;
  /** The top-level document the value belongs to. */
  doc: unknown;
  /** Field path from the document root, e.g. ["props", "path"]. */
  path: string[];
  /** Read-only rendering of the value. */
  children: ReactNode;
  /** Classes for the value's box, e.g. to outline it while its row is hovered. */
  className?: string;
}

/**
 * Shows a value in a tree row, and an editor for it on double-click where it
 * can be saved (see ValueEditContext).
 */
export function EditableValue({ value, doc, path, children, className }: EditableValueProps) {
  const edit = useValueEdit(value, doc, path);

  if (!edit.editable || edit.kind === null) return <>{children}</>;

  if (edit.editing) {
    return (
      <ValueInput
        initial={editText(value, edit.kind)}
        kind={edit.kind}
        field={path.join(".")}
        variant="inline"
        onCancel={edit.cancel}
        onSave={edit.save}
      />
    );
  }

  return (
    <span
      className={cn(
        "-ml-[3px] cursor-text rounded-xs px-[3px] hover:shadow-[inset_0_0_0_1px_var(--color-line)]",
        className,
      )}
      title="Double-click to edit"
      onDoubleClick={(e) => {
        e.stopPropagation();
        edit.begin();
      }}
    >
      {children}
    </span>
  );
}
