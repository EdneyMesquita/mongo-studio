import { useState } from "react";
import { api } from "../../lib/tauri";
import { useConnectionsStore } from "../../store/connectionsStore";
import { databaseKey, useSessionsStore } from "../../store/sessionsStore";

/** Collection names listed per session and database, kept for the session's life. */
const listed = new Map<string, Promise<string[]>>();

/**
 * The databases of a live connection, and - once `load` is called, e.g. when a
 * picker opens - the collections of one of them: the explorer's list when it
 * has it, else listed once.
 */
export function useNames(connectionId: string | null | undefined, database: string) {
  const session = useConnectionsStore((s) => (connectionId ? s.sessions[connectionId] : undefined));
  const tree = useSessionsStore((s) => (connectionId && database ? s.databaseTree[databaseKey(connectionId, database)] : undefined));
  const [names, setNames] = useState<{ key: string; list: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `${session?.sessionId}|${database}`;
  const databases = (session?.databases ?? []).map((d) => d.name).filter((d) => !["admin", "config", "local"].includes(d));
  const collections = tree?.loaded ? tree.collections.map((c) => c.name) : names?.key === key ? names.list : [];
  const load = () => {
    if (!session || !database || tree?.loaded || names?.key === key) return;
    let found = listed.get(key);
    if (!found) {
      found = api.listCollections(session.sessionId, database).then((cs) => cs.map((c) => c.name).sort());
      found.catch(() => listed.delete(key));
      listed.set(key, found);
    }
    setLoading(true);
    found.then((list) => setNames({ key, list })).catch(() => setNames({ key, list: [] })).finally(() => setLoading(false));
  };
  return { databases, collections, loading, load, live: Boolean(session) };
}

/** `{tenant}` patterns the names suggest: a suffix at least three collections share ("{tenant}_orders"). */
export function patternsOf(names: string[]): { pattern: string; count: number }[] {
  const bySuffix = new Map<string, number>();
  for (const n of names) {
    const cut = n.lastIndexOf("_");
    if (cut > 0) bySuffix.set(n.slice(cut), (bySuffix.get(n.slice(cut)) ?? 0) + 1);
  }
  return [...bySuffix]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([suffix, count]) => ({ pattern: `{tenant}${suffix}`, count }));
}
