import { useEffect, useState } from "react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ConnectionForm } from "./ConnectionForm";

export function ConnectionManager() {
  const {
    profiles,
    session,
    loading,
    refreshProfiles,
    loadSecretBackendInfo,
    secretBackend,
    connect,
    disconnect,
    deleteProfile,
  } = useConnectionsStore();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    refreshProfiles();
    loadSecretBackendInfo();
  }, [refreshProfiles, loadSecretBackendInfo]);

  if (showForm) {
    return <ConnectionForm onSaved={() => setShowForm(false)} />;
  }

  return (
    <div className="flex h-full flex-col">
      {secretBackend?.warning && (
        <div className="border-b border-border-subtle bg-amber-950 p-2 text-xs text-amber-300">
          {secretBackend.warning}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border-subtle bg-panel-alt px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Connections
        </span>
        <button
          type="button"
          className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover"
          onClick={() => setShowForm(true)}
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {profiles.length === 0 && (
          <p className="p-3 text-xs text-text-faint">
            No connections yet. Click "+ New" to add one.
          </p>
        )}
        {profiles.map((profile) => {
          const isActive = session?.connectionId === profile.id;
          return (
            <div
              key={profile.id}
              className={`group flex flex-col gap-1 border-b border-border-subtle/60 p-2.5 text-xs ${
                isActive ? "bg-panel-hover" : "hover:bg-panel-hover"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-default">{profile.name}</span>
                <button
                  type="button"
                  className="hidden text-text-faint hover:text-red-400 group-hover:inline"
                  onClick={() => deleteProfile(profile.id)}
                >
                  delete
                </button>
              </div>
              <span className="truncate font-mono text-[11px] text-text-faint">
                {profile.summary}
              </span>
              {isActive ? (
                <button
                  type="button"
                  disabled={loading}
                  className="mt-1 rounded border border-border-subtle px-2 py-1 text-text-default hover:bg-panel-hover"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  className="mt-1 rounded bg-run px-2 py-1 text-white hover:bg-run-hover disabled:opacity-50"
                  onClick={() => connect(profile.id)}
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
