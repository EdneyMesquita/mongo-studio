import { useConnectionsStore } from "../../store/connectionsStore";

export function DatabaseList() {
  const { session } = useConnectionsStore();

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Connect to a database to get started
      </div>
    );
  }

  return (
    <div className="p-4 text-neutral-200">
      <p className="mb-3 text-xs text-neutral-500">
        Connected {session.serverVersion && `· MongoDB ${session.serverVersion}`}
      </p>
      <ul className="flex flex-col gap-1">
        {session.databases.map((db) => (
          <li
            key={db.name}
            className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-neutral-900"
          >
            <span>{db.name}</span>
            <span className="text-xs text-neutral-600">
              {(db.sizeOnDisk / 1024 / 1024).toFixed(1)} MB
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
