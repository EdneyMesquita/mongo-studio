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
        <div className="border-b border-neutral-800 bg-amber-950 p-2 text-xs text-amber-300">
          {secretBackend.warning}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-neutral-800 p-2">
        <span className="text-xs font-semibold text-neutral-400">
          Connections
        </span>
        <button
          type="button"
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          onClick={() => setShowForm(true)}
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {profiles.length === 0 && (
          <p className="p-3 text-xs text-neutral-600">
            No connections yet. Click "+ New" to add one.
          </p>
        )}
        {profiles.map((profile) => {
          const isActive = session?.connectionId === profile.id;
          return (
            <div
              key={profile.id}
              className={`group flex flex-col gap-1 border-b border-neutral-900 p-2 text-xs ${
                isActive ? "bg-neutral-800" : "hover:bg-neutral-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-200">{profile.name}</span>
                <button
                  type="button"
                  className="hidden text-neutral-500 hover:text-red-400 group-hover:inline"
                  onClick={() => deleteProfile(profile.id)}
                >
                  delete
                </button>
              </div>
              <span className="truncate text-neutral-500">{profile.summary}</span>
              {isActive ? (
                <button
                  type="button"
                  disabled={loading}
                  className="mt-1 rounded bg-neutral-700 px-2 py-1 text-neutral-200 hover:bg-neutral-600"
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  className="mt-1 rounded bg-emerald-700 px-2 py-1 text-white hover:bg-emerald-600 disabled:opacity-50"
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
