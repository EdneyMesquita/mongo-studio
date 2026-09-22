import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/tauri";
import { useConnectionsStore } from "../../store/connectionsStore";

interface ConnectionsImportExportDialogProps {
  onClose: () => void;
}

export function ConnectionsImportExportDialog({
  onClose,
}: ConnectionsImportExportDialogProps) {
  const refreshProfiles = useConnectionsStore((s) => s.refreshProfiles);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedCount, setExportedCount] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: string[];
    warnings: string[];
  } | null>(null);

  async function handleExport() {
    const destPath = await save({
      defaultPath: "connections.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!destPath) return;

    setBusy(true);
    setError(null);
    setExportedCount(null);
    try {
      const summary = await api.exportConnections(destPath, includeSecrets);
      setExportedCount(summary.exported);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const srcPath = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!srcPath || Array.isArray(srcPath)) return;

    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const summary = await api.importConnections(srcPath);
      setImportResult(summary);
      await refreshProfiles();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border-subtle bg-panel p-4 shadow-xl">
        <h2 className="mb-1 text-sm font-semibold text-text-default">
          Import / Export Connections
        </h2>
        <p className="mb-4 text-xs text-text-muted">
          Uses the same JSON format MongoDB Compass reads and writes, so
          files round-trip between the two apps.
        </p>

        <div className="mb-4 rounded border border-border-subtle p-3">
          <h3 className="mb-2 text-xs font-semibold text-text-default">Export</h3>
          <label className="mb-3 flex items-center gap-2 text-xs text-text-default">
            <input
              type="checkbox"
              checked={includeSecrets}
              onChange={(e) => setIncludeSecrets(e.target.checked)}
              disabled={busy}
            />
            Include passwords (plaintext) in the exported file
          </label>
          {includeSecrets && (
            <p className="mb-3 text-xs text-amber-400">
              The file will contain plaintext credentials - store it somewhere
              safe.
            </p>
          )}
          <button
            type="button"
            className="rounded bg-panel-alt px-3 py-1.5 text-xs text-text-default hover:bg-panel-hover disabled:opacity-50"
            onClick={handleExport}
            disabled={busy}
          >
            Export to file...
          </button>
          {exportedCount !== null && (
            <p className="mt-2 text-xs text-emerald-400">
              Exported {exportedCount.toLocaleString()} connection
              {exportedCount === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        <div className="mb-4 rounded border border-border-subtle p-3">
          <h3 className="mb-2 text-xs font-semibold text-text-default">Import</h3>
          <p className="mb-3 text-xs text-text-muted">
            Import a connections export from Compass or NoSQLBooster.
            Compass files with a passphrase aren't supported yet - re-export
            without one. NoSQLBooster encrypts stored passwords, so those
            connections import without a password.
          </p>
          <button
            type="button"
            className="rounded bg-panel-alt px-3 py-1.5 text-xs text-text-default hover:bg-panel-hover disabled:opacity-50"
            onClick={handleImport}
            disabled={busy}
          >
            Choose file...
          </button>
          {importResult && (
            <div className="mt-2 text-xs">
              <p className="text-emerald-400">
                Imported {importResult.imported.toLocaleString()} connection
                {importResult.imported === 1 ? "" : "s"}.
              </p>
              {importResult.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-amber-400">
                  {importResult.warnings.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              )}
              {importResult.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-red-400">
                  {importResult.errors.map((message, i) => (
                    <li key={i}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            className="rounded bg-panel-alt px-3 py-1.5 text-xs text-text-default hover:bg-panel-hover"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
