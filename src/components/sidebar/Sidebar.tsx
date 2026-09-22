import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Search } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ConnectionForm } from "../connections/ConnectionForm";
import { ConnectionsImportExportDialog } from "../connections/ConnectionsImportExportDialog";
import { ConnectionRow } from "./ConnectionRow";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Sidebar() {
  const { profiles, refreshProfiles, loadSecretBackendInfo, secretBackend } =
    useConnectionsStore();
  const [showForm, setShowForm] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    refreshProfiles();
    loadSecretBackendInfo();
  }, [refreshProfiles, loadSecretBackendInfo]);

  const filtered = profiles.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {secretBackend?.warning && (
        <div className="border-b border-border-subtle bg-amber-950 p-2 text-xs text-amber-300">
          {secretBackend.warning}
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-base font-bold text-text-default">Mongo Studio</span>
        <ThemeSwitcher />
      </div>

      <div className="flex items-center justify-between px-3 pb-1.5 pt-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
          Connections ({profiles.length})
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1 text-text-muted hover:bg-sidebar-hover hover:text-text-default"
            onClick={() => setShowImportExport(true)}
            title="Import / export connections"
          >
            <ArrowLeftRight size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 text-text-muted hover:bg-sidebar-hover hover:text-text-default"
            onClick={() => setShowForm(true)}
            title="New connection"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 rounded border border-border-subtle bg-panel px-2 py-1">
          <Search size={12} className="shrink-0 text-text-faint" />
          <input
            className="w-full bg-transparent text-xs text-text-default placeholder:text-text-faint focus:outline-none"
            placeholder="Search connections"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-text-faint">
            {profiles.length === 0
              ? 'No connections yet. Click "+" to add one.'
              : "No matches."}
          </p>
        )}
        {filtered.map((profile) => (
          <ConnectionRow key={profile.id} profile={profile} />
        ))}
      </div>

      {showForm && (
        <ConnectionForm
          onSaved={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showImportExport && (
        <ConnectionsImportExportDialog onClose={() => setShowImportExport(false)} />
      )}
    </div>
  );
}
