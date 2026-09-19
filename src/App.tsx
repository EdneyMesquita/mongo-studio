import { AppShell } from "./components/layout/AppShell";

function App() {
  return (
    <AppShell
      sidebar={
        <div className="p-3 text-sm text-neutral-500">
          No connections yet
        </div>
      }
      statusBar={<span>Mongo Studio</span>}
    >
      <div className="flex h-full items-center justify-center text-neutral-500">
        Connect to a database to get started
      </div>
    </AppShell>
  );
}

export default App;
