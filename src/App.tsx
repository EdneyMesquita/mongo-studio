import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/sidebar/Sidebar";
import { DocumentGrid } from "./components/grid/DocumentGrid";
import { ScriptConsole } from "./components/console/ScriptConsole";
import { IndexesPanel } from "./components/indexes/IndexesPanel";
import { useConnectionsStore } from "./store/connectionsStore";
import { selectActiveTab, useSessionsStore } from "./store/sessionsStore";
import { useUiStore } from "./store/uiStore";
import type { MainTab } from "./store/uiStore";

const tabLabels: Record<MainTab, string> = {
  browse: "Browse",
  indexes: "Indexes",
  console: "Console",
};

const emptyMessages: Record<Exclude<MainTab, "console">, string> = {
  browse: "Select a collection to browse its documents",
  indexes: "Select a collection to see its indexes",
};

function App() {
  const session = useConnectionsStore((s) => s.session);
  const { mainTab, setMainTab } = useUiStore();
  const activeTab = useSessionsStore(selectActiveTab);

  function renderMain() {
    if (session && mainTab === "console") return <ScriptConsole />;
    const view = session && mainTab === "indexes" ? "indexes" : "browse";
    if (!activeTab) {
      return (
        <div className="flex h-full items-center justify-center text-text-muted">
          {emptyMessages[view]}
        </div>
      );
    }
    // Keyed by tab so per-view state (expanded nodes, index stats) starts
    // fresh on another collection instead of carrying over.
    return view === "indexes" ? (
      <IndexesPanel key={activeTab.id} tab={activeTab} />
    ) : (
      <DocumentGrid key={activeTab.id} tab={activeTab} />
    );
  }

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
        <div className="min-h-0 flex-1">{renderMain()}</div>
      </div>
    </AppShell>
  );
}

export default App;
