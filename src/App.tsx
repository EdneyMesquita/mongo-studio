import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ConnectionManager } from "./components/connections/ConnectionManager";
import { DatabaseTree } from "./components/sidebar/DatabaseTree";
import { DocumentGrid } from "./components/grid/DocumentGrid";
import { ScriptConsole } from "./components/console/ScriptConsole";
import { useConnectionsStore } from "./store/connectionsStore";

type MainTab = "browse" | "console";

function App() {
  const session = useConnectionsStore((s) => s.session);
  const [tab, setTab] = useState<MainTab>("browse");

  return (
    <AppShell
      sidebar={session ? <DatabaseTree /> : <ConnectionManager />}
      statusBar={
        <span>{session ? `Connected (${session.sessionId.slice(0, 8)})` : "Not connected"}</span>
      }
    >
      <div className="flex h-full flex-col">
        {session && (
          <div className="flex gap-1 border-b border-border-subtle bg-editor px-2 pt-1.5">
            {(["browse", "console"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-t px-3 py-1 text-xs capitalize ${
                  tab === t
                    ? "bg-panel text-text-default"
                    : "text-text-muted hover:text-text-default"
                }`}
                onClick={() => setTab(t)}
              >
                {t === "browse" ? "Browse" : "Console"}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1">
          {tab === "console" && session ? <ScriptConsole /> : <DocumentGrid />}
        </div>
      </div>
    </AppShell>
  );
}

export default App;
