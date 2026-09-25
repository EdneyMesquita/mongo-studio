import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../../lib/tauri";
import { useConnectionsStore } from "../../store/connectionsStore";
import { Modal } from "../ui/Modal";
import type { ConnectionImportPreview, ConnectionsImportSummary } from "../../types/connection";

interface ConnectionsImportExportDialogProps {
  onClose: () => void;
}

const buttonClass =
  "rounded bg-panel-alt px-3 py-1.5 text-xs text-text-default hover:bg-panel-hover disabled:opacity-50";

/** A file picked for import, with what it holds and what's ticked. */
interface PendingImport {
  path: string;
  entries: ConnectionImportPreview[];
  selected: Set<number>;
}

export function ConnectionsImportExportDialog({ onClose }: ConnectionsImportExportDialogProps) {
  const refreshProfiles = useConnectionsStore((s) => s.refreshProfiles);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedCount, setExportedCount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importResult, setImportResult] = useState<ConnectionsImportSummary | null>(null);

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

  async function handleChooseFile() {
    const srcPath = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!srcPath || Array.isArray(srcPath)) return;

    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const entries = await api.previewConnectionsImport(srcPath);
      // Everything importable is ticked, except names you already have:
      // re-importing an export would otherwise duplicate them all.
      const selected = new Set(
        entries.filter((e) => e.error === null && !e.exists).map((e) => e.index),
      );
      setPending({ path: srcPath, entries, selected });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!pending || pending.selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await api.importConnections(
        pending.path,
        [...pending.selected].sort((a, b) => a - b),
      );
      setImportResult(summary);
      setPending(null);
      await refreshProfiles();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number) {
    setPending((p) => {
      if (!p) return p;
      const selected = new Set(p.selected);
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      return { ...p, selected };
    });
  }

  const importable = pending?.entries.filter((e) => e.error === null) ?? [];
  const allSelected = importable.length > 0 && importable.every((e) => pending?.selected.has(e.index));

  function toggleAll() {
    setPending((p) =>
      p && {
        ...p,
        selected: allSelected ? new Set() : new Set(importable.map((e) => e.index)),
      },
    );
  }

  const selectedCount = pending?.selected.size ?? 0;

  return (
    <Modal
      title="Import / Export Connections"
      width="max-w-2xl"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-red-400" title={error ?? undefined}>
            {error}
          </span>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={buttonClass} onClick={onClose}>
              Close
            </button>
            {pending && (
              <button
                type="button"
                className="rounded bg-run px-3 py-1.5 text-xs text-white hover:bg-run-hover disabled:opacity-50"
                disabled={busy || selectedCount === 0}
                onClick={handleImport}
              >
                Import {selectedCount} connection{selectedCount === 1 ? "" : "s"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <p className="mb-4 text-xs text-text-muted">
        Uses the same JSON format MongoDB Compass reads and writes, so files round-trip
        between the two apps.
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
            The file will contain plaintext credentials - store it somewhere safe.
          </p>
        )}
        <button type="button" className={buttonClass} onClick={handleExport} disabled={busy}>
          Export to file...
        </button>
        {exportedCount !== null && (
          <p className="mt-2 text-xs text-emerald-400">
            Exported {exportedCount.toLocaleString()} connection
            {exportedCount === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      <div className="rounded border border-border-subtle p-3">
        <h3 className="mb-2 text-xs font-semibold text-text-default">Import</h3>
        <p className="mb-3 text-xs text-text-muted">
          Import a connections export from Compass or NoSQLBooster. Compass files with a
          passphrase aren't supported yet - re-export without one. NoSQLBooster encrypts
          stored passwords, so those connections import without a password.
        </p>
        <button type="button" className={buttonClass} onClick={handleChooseFile} disabled={busy}>
          {pending ? "Choose another file..." : "Choose file..."}
        </button>

        {pending && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={importable.length === 0}
                  onChange={toggleAll}
                />
                Select all
              </label>
              <span>
                {selectedCount} of {pending.entries.length} selected
              </span>
            </div>
            {/* Scrolls on its own so a long file doesn't push the footer away. */}
            <ul className="max-h-72 overflow-y-auto rounded border border-border-subtle">
              {pending.entries.map((entry) => (
                <li
                  key={entry.index}
                  className="border-b border-border-subtle last:border-b-0"
                >
                  <label
                    className={`flex items-start gap-2 px-2 py-1.5 text-xs ${
                      entry.error ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-panel-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={pending.selected.has(entry.index)}
                      disabled={entry.error !== null}
                      onChange={() => toggle(entry.index)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-text-default">
                          {entry.name || "(unnamed)"}
                        </span>
                        {entry.exists && (
                          <span className="shrink-0 rounded bg-amber-950 px-1 text-[10px] text-amber-300">
                            already saved
                          </span>
                        )}
                      </span>
                      {entry.address && (
                        <span className="block truncate font-mono text-[11px] text-text-faint">
                          {entry.address}
                        </span>
                      )}
                      {entry.warning && (
                        <span className="block text-[11px] text-amber-400">{entry.warning}</span>
                      )}
                      {entry.error && (
                        <span className="block text-[11px] text-red-400">
                          Can't import: {entry.error}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {importResult && (
          <div className="mt-3 text-xs">
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
    </Modal>
  );
}
