import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/tauri";
import { collectionFor, isPattern, tenantOf } from "../../lib/relations";
import { useConnectionsStore } from "../../store/connectionsStore";
import { databaseKey, useSessionsStore, type RelationTab } from "../../store/sessionsStore";
import type { FindRelatedOutput, Relation } from "../../types/relations";

/** Sample documents read from the From side when no open tab has them. */
const SAMPLE_SIZE = 20;
/** Related documents kept per sample document, for the To card's navigation. */
const FOUND_PER_SAMPLE = 20;
/** Collections a pattern offers as the sample in the From card. */
const CANDIDATES_SHOWN = 50;

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface RelationData {
  /** The sample connection's live session. */
  sourceSessionId: string | null;
  /** Collections the From pattern matches on the sample connection (first ones). */
  candidates: string[];
  /** Every collection it matches, for the sample picker. */
  matching: string[];
  sampleCollection: string | null;
  sampleDocs: unknown[];
  sampleState: LoadState;
  sampleError: string | null;
  /** undefined while it's worked out; null when no connection pairs with the sample's. */
  targetConnectionId: string | null | undefined;
  targetSessionId: string | null;
  targetCollection: string | null;
  tenant: string | null;
  /** A To document to show the fields of when the sample finds none. */
  toSample: unknown | null;
  preview: FindRelatedOutput | null;
  previewState: LoadState;
  previewError: string | null;
}

const errorText = (e: unknown) => String(e).replace(/^Error: /, "");

/** The relation's parts that change what the preview finds. */
function matchKey(r: Relation): string {
  return JSON.stringify([r.from, r.to, r.rules, r.scope, r.pairs]);
}

export const runnable = (r: Relation) =>
  r.to.db !== "" && r.to.coll !== "" && r.rules.some((rule) => rule.length > 0 && rule.every((c) => c.from && c.to));

/**
 * What the relation editor shows: sample From documents (an open tab's
 * page of that collection, else the newest few), the connection and
 * collection on the other side, and what the relation finds for each.
 */
export function useRelationData(tab: RelationTab, relation: Relation, sampleOverride: string | null): RelationData {
  const sourceSessionId = useConnectionsStore((s) => s.sessions[tab.connection.id]?.sessionId ?? null);
  const sessions = useConnectionsStore((s) => s.sessions);
  const from = relation.from;

  // collections the From side matches on the sample connection
  const tree = useSessionsStore((s) => s.databaseTree[databaseKey(tab.connection.id, from.db)]);
  const [listed, setListed] = useState<{ key: string; names: string[] } | null>(null);
  const listKey = `${sourceSessionId}|${from.db}`;
  useEffect(() => {
    if (!sourceSessionId || !from.db || !isPattern(from.coll) || tree?.loaded) return;
    if (listed?.key === listKey) return;
    let cancelled = false;
    api
      .listCollections(sourceSessionId, from.db)
      .then((cs) => !cancelled && setListed({ key: listKey, names: cs.map((c) => c.name) }))
      .catch(() => !cancelled && setListed({ key: listKey, names: [] }));
    return () => {
      cancelled = true;
    };
  }, [listKey, from.coll, tree?.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTabs = useSessionsStore((s) => s.tabs);
  const matching = useMemo(() => {
    if (!from.coll) return [];
    if (!isPattern(from.coll)) return [from.coll];
    const names = tree?.loaded ? tree.collections.map((c) => c.name) : listed?.key === listKey ? listed.names : [];
    const open = openTabs.flatMap((t) =>
      t.kind === "collection" && t.connection.id === tab.connection.id && t.database === from.db ? [t.collection] : [],
    );
    return [...new Set([...open, ...names])].filter((c) => tenantOf(from.coll, c) !== null);
  }, [from.coll, from.db, tree, listed, listKey, openTabs, tab.connection.id]);
  const candidates = useMemo(() => matching.slice(0, CANDIDATES_SHOWN), [matching]);

  const sampleCollection =
    sampleOverride && tenantOf(from.coll, sampleOverride) !== null ? sampleOverride : (candidates[0] ?? null);

  // the sample: an open tab's page of that collection, else the newest documents
  const openPage = useSessionsStore((s) => {
    const t = s.tabs.find(
      (x) => x.kind === "collection" && x.connection.id === tab.connection.id && x.database === from.db && x.collection === sampleCollection,
    );
    return t?.kind === "collection" && t.results?.documents.length ? t.results.documents : null;
  });
  const [read, setRead] = useState<{ key: string; docs: unknown[]; state: LoadState; error: string | null }>({
    key: "",
    docs: [],
    state: "idle",
    error: null,
  });
  const readKey = `${sourceSessionId}|${from.db}|${sampleCollection}`;
  useEffect(() => {
    if (openPage || !sourceSessionId || !sampleCollection) return;
    if (read.key === readKey && read.state !== "error") return;
    let cancelled = false;
    setRead({ key: readKey, docs: [], state: "loading", error: null });
    api
      .runFind(sourceSessionId, from.db, sampleCollection, { filter: {}, sort: { _id: -1 }, projection: null, limit: SAMPLE_SIZE, skip: null })
      .then((page) => !cancelled && setRead({ key: readKey, docs: page.documents, state: "ready", error: null }))
      .catch((e) => !cancelled && setRead({ key: readKey, docs: [], state: "error", error: errorText(e) }));
    return () => {
      cancelled = true;
    };
  }, [readKey, Boolean(openPage)]); // eslint-disable-line react-hooks/exhaustive-deps
  const sampleDocs = openPage ?? (read.key === readKey ? read.docs : []);
  const sampleState: LoadState = openPage ? "ready" : !sampleCollection ? "idle" : read.key === readKey ? read.state : "loading";

  // the other side's connection, worked out by the backend (pairs, same cluster)
  const [target, setTarget] = useState<{ key: string; id: string | null } | null>(null);
  const targetKey = JSON.stringify([relation.to, relation.pairs, relation.from.conn, tab.connection.id]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .relationTargetConnection(relation, "from", tab.connection.id)
        .then((id) => !cancelled && setTarget({ key: targetKey, id }))
        .catch(() => !cancelled && setTarget({ key: targetKey, id: null }));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetConnectionId = target?.key === targetKey ? target.id : undefined;
  const targetSessionId = targetConnectionId ? (sessions[targetConnectionId]?.sessionId ?? null) : null;

  const tenant = sampleCollection ? tenantOf(from.coll, sampleCollection) : null;
  const targetCollection = relation.to.coll && tenant !== null ? collectionFor(relation.to.coll, tenant) : relation.to.coll || null;

  // one To document, for its fields, scoped to the tenant like the matches are
  const [toSample, setToSample] = useState<{ key: string; doc: unknown | null } | null>(null);
  const scopeKey = JSON.stringify(relation.scope);
  const toKey = `${targetSessionId}|${relation.to.db}|${targetCollection}|${tenant}|${scopeKey}`;
  useEffect(() => {
    if (!targetSessionId || !relation.to.db || !targetCollection) return;
    let cancelled = false;
    const filter = Object.fromEntries(relation.scope.filter((s) => s.value === "{tenant}" && tenant).map((s) => [s.to, tenant]));
    api
      .runFind(targetSessionId, relation.to.db, targetCollection, { filter, sort: { _id: -1 }, projection: null, limit: 1, skip: null })
      .then((page) => !cancelled && setToSample({ key: toKey, doc: page.documents[0] ?? null }))
      .catch(() => !cancelled && setToSample({ key: toKey, doc: null }));
    return () => {
      cancelled = true;
    };
  }, [toKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // what the relation finds for every sample document, re-run as it's edited
  const [found, setFound] = useState<{ key: string; output: FindRelatedOutput | null; state: LoadState; error: string | null }>({
    key: "",
    output: null,
    state: "idle",
    error: null,
  });
  const canRun = runnable(relation) && Boolean(targetSessionId && sampleCollection && sampleDocs.length);
  const foundKey = `${matchKey(relation)}|${targetSessionId}|${sampleCollection}|${sampleDocs.length}|${JSON.stringify(sampleDocs[0] ?? null).slice(0, 200)}`;
  useEffect(() => {
    if (!canRun || !targetSessionId || !sampleCollection) return;
    let cancelled = false;
    setFound((f) => ({ key: foundKey, output: f.output, state: "loading", error: null }));
    const timer = setTimeout(() => {
      api
        .relationFindRelated({
          relation,
          dir: "from",
          source: { connectionId: tab.connection.id, database: from.db, collection: sampleCollection },
          targetSessionId,
          documents: sampleDocs,
          docsPerSource: FOUND_PER_SAMPLE,
        })
        .then((output) => !cancelled && setFound({ key: foundKey, output, state: "ready", error: null }))
        .catch((e) => !cancelled && setFound({ key: foundKey, output: null, state: "error", error: errorText(e) }));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [foundKey, canRun]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    sourceSessionId,
    candidates,
    matching,
    sampleCollection,
    sampleDocs,
    sampleState,
    sampleError: openPage ? null : read.key === readKey ? read.error : null,
    targetConnectionId,
    targetSessionId,
    targetCollection,
    tenant,
    toSample: toSample?.key === toKey ? toSample.doc : null,
    preview: canRun && found.output ? found.output : null,
    previewState: canRun ? found.state : "idle",
    previewError: canRun ? found.error : null,
  };
}
