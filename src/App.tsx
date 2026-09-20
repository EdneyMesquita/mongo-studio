import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/sidebar/Sidebar";
import { DocumentGrid } from "./components/grid/DocumentGrid";
import { ScriptConsole } from "./components/console/ScriptConsole";
import { IndexesPanel } from "./components/indexes/IndexesPanel";
import { useConnectionsStore } from "./store/connectionsStore";
import { useUiStore } from "./store/uiStore";
import type { MainTab } from "./store/uiStore";

const tabLabels: Record<MainTab, string> = {
  browse: "Browse",
  indexes: "Indexes",
  console: "Console",
};

function App() {
  const session = useConnectionsStore((s) => s.session);
  const { mainTab, setMainTab } = useUiStore();

  return (
    <AppShell
      sidebar={<Sidebar />}
      statusBar={
        <span>
          {session
            ? `Connected${session.serverVersion ? ` · MongoDB ${session.serverVersion}` : ""}`
            : "Not connected"}
        </span>
      }
    >
      <div className="flex h-full flex-col">
        {session && (
          <div className="flex gap-1 border-b border-border-subtle bg-editor px-2 pt-1.5">
            {(["browse", "indexes", "console"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-t px-3 py-1 text-xs ${
                  mainTab === t
                    ? "bg-panel text-text-default"
                    : "text-text-muted hover:text-text-default"
                }`}
                onClick={() => setMainTab(t)}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {!session ? (
            <DocumentGrid />
          ) : mainTab === "console" ? (
            <ScriptConsole />
          ) : mainTab === "indexes" ? (
            <IndexesPanel />
          ) : (
            <DocumentGrid />
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default App;
