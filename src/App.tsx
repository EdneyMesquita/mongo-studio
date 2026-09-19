import { AppShell } from "./components/layout/AppShell";
import { ConnectionManager } from "./components/connections/ConnectionManager";
import { DatabaseList } from "./components/sidebar/DatabaseList";
import { useConnectionsStore } from "./store/connectionsStore";

function App() {
  const session = useConnectionsStore((s) => s.session);

  return (
    <AppShell
      sidebar={<ConnectionManager />}
      statusBar={
        <span>{session ? `Connected (${session.sessionId.slice(0, 8)})` : "Not connected"}</span>
      }
    >
      <DatabaseList />
    </AppShell>
  );
}

export default App;
