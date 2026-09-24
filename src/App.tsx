import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/sidebar/Sidebar";
import { DocumentGrid } from "./components/grid/DocumentGrid";
import { ScriptConsole } from "./components/console/ScriptConsole";
import { IndexesPanel } from "./components/indexes/IndexesPanel";
import { CollectionTabs } from "./components/tabs/CollectionTabs";
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
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTab = useSessionsStore(selectActiveTab);

  const view: MainTab = !session ? "browse" : mainTab;

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
        {session && <CollectionTabs />}
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
        <div className="relative min-h-0 flex-1">
          {/* Every tab's grid stays mounted and only the active one shows, so
              switching back keeps its scroll position and expanded nodes. */}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${
                view === "browse" && tab.id === activeTab?.id ? "" : "invisible"
              }`}
            >
              <DocumentGrid tab={tab} />
            </div>
          ))}
          {view === "indexes" && activeTab && (
            <IndexesPanel key={activeTab.id} tab={activeTab} />
          )}
          {view === "console" && <ScriptConsole />}
          {view !== "console" && !activeTab && (
            <div className="flex h-full items-center justify-center text-text-muted">
              {emptyMessages[view]}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default App;
