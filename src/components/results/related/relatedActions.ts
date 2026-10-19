import { useMemo } from "react";
import { toast } from "sonner";
import { idFilterText } from "../../../lib/relatedView";
import { useConnectionsStore } from "../../../store/connectionsStore";
import { tabIdFor, useSessionsStore, type CollectionTab, type TabConnection } from "../../../store/sessionsStore";
import { useUiStore } from "../../../store/uiStore";
import { api } from "../../../lib/tauri";
import type { RelationEnd } from "../../../lib/relations";

/** The source `useRelatedPages` takes, stable while the tab's collection stays. */
export function useRelatedSource(tab: CollectionTab) {
  const { id, connection, database, collection } = tab;
  return useMemo(
    () => ({ tabId: id, connectionId: connection.id, database, collection }),
    [id, connection.id, database, collection],
  );
}

/** A connection as a tab shows it, from its saved profile. */
export function tabConnectionOf(connectionId: string): TabConnection | null {
  const profile = useConnectionsStore.getState().profiles.find((p) => p.id === connectionId);
  return profile ? { id: profile.id, name: profile.name, summary: profile.summary } : null;
}

/**
 * Opens the other side's collection in its tab - opening one if needed -
 * filtered to the related documents found, and runs it.
 */
export async function openRelatedDocuments(connectionId: string, database: string, collection: string, docs: unknown[]) {
  const live = useConnectionsStore.getState().sessions[connectionId];
  const connection = tabConnectionOf(connectionId);
  const filterText = idFilterText(docs);
  if (!live || !connection || !filterText) {
    toast.error(live ? "These documents have no _id to open them by" : `${connection?.name ?? "That connection"} isn't connected`);
    return;
  }
  const sessions = useSessionsStore.getState();
  const id = tabIdFor(connectionId, database, collection);
  // a new tab runs its first query right away; the filtered run below replaces it
  if (!sessions.tabs.some((t) => t.id === id)) void sessions.openCollection(live.sessionId, connection, database, collection);
  else sessions.activateTab(id);
  useUiStore.getState().setMainTab(id, "browse");
  useSessionsStore.getState().updateTab(id, { mode: "find", filterText, skip: 0 });
  await useSessionsStore.getState().runQuery(live.sessionId, id);
}

/** Related documents a tab opens at most, by `_id`. */
export const OPEN_CAP = 1000;

/**
 * Opens every related document of one source document: the page keeps only
 * a few per document, so the rest are found again for this one (up to
 * `OPEN_CAP`) before the tab opens on them.
 */
export async function openAllRelated(
  source: { connectionId: string; database: string; collection: string },
  end: RelationEnd,
  doc: unknown,
  target: { connectionId: string; database: string; collection: string },
  count: number,
  shown: unknown[],
) {
  if (count <= shown.length) return openRelatedDocuments(target.connectionId, target.database, target.collection, shown);
  const live = useConnectionsStore.getState().sessions[target.connectionId];
  if (!live) return openRelatedDocuments(target.connectionId, target.database, target.collection, shown);
  try {
    const output = await api.relationFindRelated({
      relation: end.relation,
      dir: end.dir,
      source,
      targetSessionId: live.sessionId,
      documents: [doc],
      docsPerSource: Math.min(count, OPEN_CAP),
    });
    await openRelatedDocuments(target.connectionId, target.database, target.collection, output.results[0]?.docs ?? shown);
  } catch (e) {
    toast.error("Couldn't find the related documents", { description: String(e).replace(/^Error: /, "") });
  }
}

/** Connects the other side's connection; a failure lands in `connectErrors`. */
export function connectRelated(connectionId: string) {
  void useConnectionsStore.getState().connect(connectionId);
}
