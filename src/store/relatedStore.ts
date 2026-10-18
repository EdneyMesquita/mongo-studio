import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { api } from "../lib/tauri";
import { columnKey, relationsOf, type RelatedColumn, type RelationEnd } from "../lib/relations";
import type { FindRelatedOutput, Relation, RelationDir } from "../types/relations";
import { useConnectionsStore } from "./connectionsStore";
import { useRelationsStore } from "./relationsStore";

/**
 * The related documents of a page of results, one backend call per
 * relation end and page: the inspector's Related section reads one row of
 * it, the Related columns read every row.
 */

/** Related documents kept per source document, for the inspector. */
const DOCS_PER_SOURCE = 5;

export interface RelatedPage {
  /** The page it was found for; a new page means a new call. */
  docs: unknown[];
  colsKey: string;
  /** The connection the other side lives on; null when none pairs with this one. */
  targetConnectionId: string | null;
  state: "loading" | "ready" | "error";
  output: FindRelatedOutput | null;
  error: string | null;
}

interface RelatedState {
  /** By `pageKey(tabId, relationId, dir)`. */
  pages: Record<string, RelatedPage>;
  /** Each collection tab's Related columns. */
  columns: Record<string, RelatedColumn[]>;
  /** Per tab, the column whose "only these" filter is on. */
  only: Record<string, number | null>;
  addColumn: (tabId: string, column: RelatedColumn) => void;
  removeColumn: (tabId: string, index: number) => void;
  toggleOnly: (tabId: string, index: number) => void;
}

const NO_COLUMNS: RelatedColumn[] = [];

export const useRelatedStore = create<RelatedState>((set) => ({
  pages: {},
  columns: {},
  only: {},
  addColumn: (tabId, column) =>
    set((s) => {
      const current = s.columns[tabId] ?? NO_COLUMNS;
      if (current.some((c) => columnKey(c) === columnKey(column))) return s;
      // the id is the aggregate's in the backend's answer: one per column
      return { columns: { ...s.columns, [tabId]: [...current, { ...column, id: columnKey(column) }] } };
    }),
  removeColumn: (tabId, index) =>
    set((s) => ({
      columns: { ...s.columns, [tabId]: (s.columns[tabId] ?? NO_COLUMNS).filter((_, i) => i !== index) },
      only: { ...s.only, [tabId]: null },
    })),
  toggleOnly: (tabId, index) => set((s) => ({ only: { ...s.only, [tabId]: s.only[tabId] === index ? null : index } })),
}));

/** A tab's Related columns. */
export const useRelatedColumns = (tabId: string) => useRelatedStore((s) => s.columns[tabId] ?? NO_COLUMNS);

export const pageKey = (tabId: string, relationId: string, dir: RelationDir) => `${tabId}|${relationId}|${dir}`;

const targets = new Map<string, Promise<string | null>>();

/** Which connection a relation end reads from this one; cached per relation version. */
export function targetConnection(relation: Relation, dir: RelationDir, sourceConnectionId: string): Promise<string | null> {
  const key = `${relation.id}|${relation.updatedAt}|${dir}|${sourceConnectionId}`;
  let found = targets.get(key);
  if (!found) {
    found = api.relationTargetConnection(relation, dir, sourceConnectionId).catch(() => null);
    targets.set(key, found);
  }
  return found;
}

function patch(key: string, value: Partial<RelatedPage>) {
  useRelatedStore.setState((s) => {
    const current = s.pages[key];
    return current ? { pages: { ...s.pages, [key]: { ...current, ...value } } } : s;
  });
}

interface Source {
  tabId: string;
  connectionId: string;
  database: string;
  collection: string;
}

/** Finds the related documents of a page for one relation end, unless that page is already found or loading. */
async function loadPage(source: Source, end: RelationEnd, docs: unknown[], columns: RelatedColumn[]) {
  const key = pageKey(source.tabId, end.relation.id, end.dir);
  const colsKey = `${end.relation.updatedAt}#${columns.map(columnKey).join(",")}`;
  const existing = useRelatedStore.getState().pages[key];
  if (existing && existing.docs === docs && existing.colsKey === colsKey && existing.state !== "error") return;
  useRelatedStore.setState((s) => ({
    pages: {
      ...s.pages,
      [key]: { docs, colsKey, targetConnectionId: existing?.targetConnectionId ?? null, state: "loading", output: null, error: null },
    },
  }));
  const stale = () => {
    const now = useRelatedStore.getState().pages[key];
    return !now || now.docs !== docs || now.colsKey !== colsKey;
  };
  const targetId = await targetConnection(end.relation, end.dir, source.connectionId);
  if (stale()) return;
  patch(key, { targetConnectionId: targetId });
  const live = targetId ? useConnectionsStore.getState().sessions[targetId] : null;
  if (!targetId || !live) {
    // nothing to read until it's connected: the UI offers Connect
    patch(key, { state: "ready", output: null });
    return;
  }
  try {
    const output = await api.relationFindRelated({
      relation: end.relation,
      dir: end.dir,
      source: { connectionId: source.connectionId, database: source.database, collection: source.collection },
      targetSessionId: live.sessionId,
      documents: docs,
      aggregates: columns.map(({ relationId: _r, dir: _d, ...agg }) => agg),
      docsPerSource: DOCS_PER_SOURCE,
    });
    if (!stale()) patch(key, { state: "ready", output });
  } catch (e) {
    if (!stale()) patch(key, { state: "error", error: String(e).replace(/^Error: /, "") });
  }
}

/**
 * The relation ends of a collection tab's results, and their pages found
 * for `docs`, keyed `relationId|dir`. The tab's Related columns add their
 * aggregates to the call of their end. A connection coming up (the other
 * side) reloads what was waiting on it.
 */
export function useRelatedPages(
  source: Source | null,
  docs: unknown[] | null,
): { ends: RelationEnd[]; pages: Record<string, RelatedPage | undefined> } {
  const columns = useRelatedColumns(source?.tabId ?? "");
  const relations = useRelationsStore((s) => s.relations);
  const sessions = useConnectionsStore((s) => s.sessions);
  const ends = useMemo(
    () => (source ? relationsOf(relations, source.connectionId, source.database, source.collection) : []),
    [relations, source?.connectionId, source?.database, source?.collection], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const colsKey = columns.map(columnKey).join(",");

  useEffect(() => {
    if (!source || !docs || docs.length === 0) return;
    for (const end of ends) {
      const mine = columns.filter((c) => c.relationId === end.relation.id && c.dir === end.dir);
      const key = pageKey(source.tabId, end.relation.id, end.dir);
      const page = useRelatedStore.getState().pages[key];
      // a page waiting on a connection that's now up starts over
      if (page && page.docs === docs && !page.output && page.targetConnectionId && sessions[page.targetConnectionId]) {
        useRelatedStore.setState((s) => {
          const pages = { ...s.pages };
          delete pages[key];
          return { pages };
        });
      }
      void loadPage(source, end, docs, mine);
    }
  }, [ends, docs, colsKey, sessions, source?.tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = useRelatedStore((s) => s.pages);
  const mine = useMemo(() => {
    const out: Record<string, RelatedPage | undefined> = {};
    if (source) for (const end of ends) out[`${end.relation.id}|${end.dir}`] = pages[pageKey(source.tabId, end.relation.id, end.dir)];
    return out;
  }, [ends, pages, source?.tabId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ends, pages: mine };
}

/** Forgets a tab's pages, when it closes. */
export function forgetRelatedPages(tabId: string) {
  useRelatedStore.setState((s) => ({
    pages: Object.fromEntries(Object.entries(s.pages).filter(([k]) => !k.startsWith(`${tabId}|`))),
    columns: Object.fromEntries(Object.entries(s.columns).filter(([k]) => k !== tabId)),
    only: Object.fromEntries(Object.entries(s.only).filter(([k]) => k !== tabId)),
  }));
}
