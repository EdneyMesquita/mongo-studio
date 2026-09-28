import { useMemo } from "react";
import { connectionColor } from "../../lib/connectionColor";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { TabConnection } from "../../store/sessionsStore";

export interface PaletteCollection {
  /** Unique across connections: `<connectionId>/<database>.<collection>`. */
  key: string;
  connection: TabConnection;
  color: string;
  database: string;
  collection: string;
}

/**
 * Every collection already listed in the Explorer for a connected server:
 * the databases whose collections have been loaded. Nothing is fetched here.
 */
export function usePaletteCollections(): PaletteCollection[] {
  const tree = useSessionsStore((s) => s.databaseTree);
  const sessions = useConnectionsStore((s) => s.sessions);
  const profiles = useConnectionsStore((s) => s.profiles);

  return useMemo(() => {
    const items: PaletteCollection[] = [];
    for (const profile of profiles) {
      if (!sessions[profile.id]) continue;
      const connection = { id: profile.id, name: profile.name, summary: profile.summary };
      const color = connectionColor(profile.id, profile.color);
      const prefix = `${profile.id}/`;
      for (const [key, state] of Object.entries(tree)) {
        // keys are databaseKey(): "<connectionId>/<database>"
        if (!key.startsWith(prefix) || !state.loaded) continue;
        const database = key.slice(prefix.length);
        for (const { name } of state.collections) {
          items.push({
            key: `${key}.${name}`,
            connection,
            color,
            database,
            collection: name,
          });
        }
      }
    }
    return items;
  }, [tree, sessions, profiles]);
}
