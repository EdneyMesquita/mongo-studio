import { useUiStore } from "../../store/uiStore";
import { ConnectionForm } from "../connections/ConnectionForm";
import { ConnectionsImportExportDialog } from "../connections/ConnectionsImportExportDialog";
import { EditConnectionDialog } from "./EditConnectionDialog";

/**
 * App-level dialogs, opened from anywhere through uiStore: the connection
 * form (for a new connection or a saved one) and import / export.
 */
export function DialogHost() {
  const dialog = useUiStore((s) => s.connectionDialog);
  const setConnectionDialog = useUiStore((s) => s.setConnectionDialog);
  const importExportOpen = useUiStore((s) => s.importExportOpen);
  const setImportExportOpen = useUiStore((s) => s.setImportExportOpen);
  const close = () => setConnectionDialog(null);

  if (dialog?.mode === "new") return <ConnectionForm onSaved={close} onCancel={close} />;
  if (dialog?.mode === "edit") return <EditConnectionDialog key={dialog.id} id={dialog.id} onClose={close} />;
  if (importExportOpen) {
    return <ConnectionsImportExportDialog onClose={() => setImportExportOpen(false)} />;
  }
  return null;
}
