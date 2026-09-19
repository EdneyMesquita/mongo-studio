import { AppShell } from "./components/layout/AppShell";
import { ConnectionManager } from "./components/connections/ConnectionManager";
import { DatabaseTree } from "./components/sidebar/DatabaseTree";
import { DocumentGrid } from "./components/grid/DocumentGrid";
import { useConnectionsStore } from "./store/connectionsStore";

function App() {
  const session = useConnectionsStore((s) => s.session);

  return (
    <AppShell
      sidebar={session ? <DatabaseTree /> : <ConnectionManager />}
      statusBar={
        <span>{session ? `Connected (${session.sessionId.slice(0, 8)})` : "Not connected"}</span>
      }
    >
      <DocumentGrid />
    </AppShell>
  );
}

export default App;
