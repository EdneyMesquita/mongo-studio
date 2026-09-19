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
          <div className="flex gap-1 border-b border-neutral-800 bg-neutral-950 px-2 pt-1.5">
            {(["browse", "console"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-t px-3 py-1 text-xs capitalize ${
                  tab === t
                    ? "bg-neutral-900 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
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
