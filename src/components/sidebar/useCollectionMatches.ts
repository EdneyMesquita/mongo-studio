import { useMemo } from "react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { CollectionInfo } from "../../types/connection";

export interface CollectionMatches {
  connectionId: string;
  sessionId: string;
  database: string;
  collections: CollectionInfo[];
}

/**
 * The open database's collections whose names contain the sidebar search,
 * or null when none do. Only that database's collections are in hand - the
 * sidebar loads one database at a time - so that's what the search covers.
 */
export function useCollectionMatches(query: string): CollectionMatches | null {
  const session = useConnectionsStore((s) => s.session);
  const collections = useSessionsStore((s) => s.collections);
  const expandedDatabase = useSessionsStore((s) => s.expandedDatabase);
  const collectionsDatabase = useSessionsStore((s) => s.collectionsDatabase);
  const collectionsLoading = useSessionsStore((s) => s.collectionsLoading);

  return useMemo(() => {
    if (!query || !session || collectionsLoading) return null;
    if (!expandedDatabase || expandedDatabase !== collectionsDatabase) return null;
    const matching = collections.filter((c) => c.name.toLowerCase().includes(query));
    return matching.length === 0
      ? null
      : {
          connectionId: session.connectionId,
          sessionId: session.sessionId,
          database: expandedDatabase,
          collections: matching,
        };
  }, [query, session, collections, expandedDatabase, collectionsDatabase, collectionsLoading]);
}
