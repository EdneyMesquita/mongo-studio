import { create } from "zustand";
import { api } from "../lib/tauri";
import type { CollectionInfo } from "../types/connection";
import type { CollectionStats, QueryResultPage } from "../types/query";

export type QueryMode = "find" | "aggregate";

/** The connection a tab was opened on, as shown on the tab. */
export interface TabConnection {
  id: string;
  name: string;
  /** Server address with credentials masked, e.g. mongodb://***@host:27017. */
  summary: string;
}

/** One open collection, with its own query, results and stats. */
export interface CollectionTab {
  id: string;
  connection: TabConnection;
  database: string;
  collection: string;
  stats: CollectionStats | null;
  results: QueryResultPage | null;
  /**
   * The mode that produced `results`. Only find results are documents as
   * stored; aggregate output can be regrouped or computed, so it isn't
   * editable even when it has an _id.
   */
  resultsMode: QueryMode | null;
  mode: QueryMode;
  filterText: string;
  sortText: string;
  limit: number;
  skip: number;
  pipelineText: string;
  loading: boolean;
  error: string | null;
}

/** The part of a tab the query bar edits. */
export type TabQueryFields = Pick<
  CollectionTab,
  "mode" | "filterText" | "sortText" | "limit" | "skip" | "pipelineText"
>;

/** A database's row in the sidebar: open or not, and its collections. */
export interface DatabaseTreeState {
  expanded: boolean;
  collections: CollectionInfo[];
  /** Whether `collections` has been fetched; reopening reuses it. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

/** A database on a connection. */
export interface DatabaseRef {
  connectionId: string;
  database: string;
}

interface SessionsState {
  /**
   * Every database row's state, by `databaseKey`. Purely visual:
   * collapsing a database leaves every tab open on it alone.
   */
  databaseTree: Record<string, DatabaseTreeState>;
  /** The database last opened in the sidebar. */
  lastDatabase: DatabaseRef | null;
  tabs: CollectionTab[];
  activeTabId: string | null;

  toggleDatabase: (connectionId: string, sessionId: string, database: string) => Promise<void>;
  /** Focuses the collection's tab, opening one if it has none yet. */
  openCollection: (
    sessionId: string,
    connection: TabConnection,
    database: string,
    collection: string,
  ) => Promise<void>;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  updateTab: (id: string, patch: Partial<TabQueryFields>) => void;
  runQuery: (sessionId: string, id: string) => Promise<void>;
  /** Swaps in a document as stored after an edit, matched on _id. */
  replaceDocument: (id: string, updated: unknown) => void;
  /** Forgets a connection going away: its tabs and its sidebar state. */
  closeConnection: (connectionId: string) => void;
}

/**
 * Unique per collection per connection: database names can't contain dots,
 * and the connection id keeps same-named collections on different servers
 * apart.
 */
export function tabIdFor(connectionId: string, database: string, collection: string): string {
  return `${connectionId}/${database}.${collection}`;
}

export function selectActiveTab(state: SessionsState): CollectionTab | null {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

/** Key of a database in `databaseTree`: database names can't contain "/". */
export function databaseKey(connectionId: string, database: string): string {
  return `${connectionId}/${database}`;
}

/**
 * The database the console should run against: the active tab's, else the
 * one last opened in the sidebar.
 */
export function selectCurrentDatabase(state: SessionsState): DatabaseRef | null {
  const tab = selectActiveTab(state);
  return tab ? { connectionId: tab.connection.id, database: tab.database } : state.lastDatabase;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function parseJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("Pipeline must be a JSON array of stages");
  }
  return parsed;
}

function newTab(
  connection: TabConnection,
  database: string,
  collection: string,
): CollectionTab {
  return {
    id: tabIdFor(connection.id, database, collection),
    connection,
    database,
    collection,
    stats: null,
    results: null,
    resultsMode: null,
    mode: "find",
    filterText: "{}",
    sortText: "",
    limit: 50,
    skip: 0,
    pipelineText: "[\n  { \"$limit\": 50 }\n]",
    loading: false,
    error: null,
  };
}

const initialState = {
  databaseTree: {} as Record<string, DatabaseTreeState>,
  lastDatabase: null as DatabaseRef | null,
  tabs: [] as CollectionTab[],
  activeTabId: null as string | null,
};

const closedDatabase: DatabaseTreeState = {
  expanded: false,
  collections: [],
  loaded: false,
  loading: false,
  error: null,
};

export const useSessionsStore = create<SessionsState>((set, get) => {
  // Requests outlive the tab that made them when it's closed mid-flight;
  // patching a tab that's gone is simply a no-op.
  function patchTab(id: string, patch: Partial<CollectionTab>) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  return {
    ...initialState,

    toggleDatabase: async (connectionId, sessionId, database) => {
      const key = databaseKey(connectionId, database);
      const patchDatabase = (patch: Partial<DatabaseTreeState>) =>
        set((s) => ({
          databaseTree: {
            ...s.databaseTree,
            [key]: { ...(s.databaseTree[key] ?? closedDatabase), ...patch },
          },
        }));
      const current = get().databaseTree[key] ?? closedDatabase;
      if (current.expanded) {
        patchDatabase({ expanded: false });
        return;
      }
      set({ lastDatabase: { connectionId, database } });
      // Reopening a database already listed: show its collections again.
      if (current.loaded || current.loading) {
        patchDatabase({ expanded: true });
        return;
      }
      patchDatabase({ expanded: true, loading: true, error: null });
      try {
        const collections = await api.listCollections(sessionId, database);
        // Gone if the connection closed meanwhile.
        if (get().databaseTree[key]) patchDatabase({ collections, loaded: true, loading: false });
      } catch (e) {
        // Not loaded, so the next open retries.
        if (get().databaseTree[key]) patchDatabase({ error: String(e), loading: false });
      }
    },

    openCollection: async (sessionId, connection, database, collection) => {
      const id = tabIdFor(connection.id, database, collection);
      if (get().tabs.some((t) => t.id === id)) {
        set({ activeTabId: id });
        return;
      }
      set((s) => ({
        tabs: [...s.tabs, { ...newTab(connection, database, collection), loading: true }],
        activeTabId: id,
      }));
      try {
        const stats = await api.getCollectionStats(sessionId, database, collection);
        patchTab(id, { stats, loading: false });
        await get().runQuery(sessionId, id);
      } catch (e) {
        patchTab(id, { error: String(e), loading: false });
      }
    },

    activateTab: (id) => set({ activeTabId: id }),

    closeTab: (id) =>
      set((s) => {
        const index = s.tabs.findIndex((t) => t.id === id);
        if (index === -1) return s;
        const tabs = s.tabs.filter((t) => t.id !== id);
        // Closing the active tab hands focus to its right neighbour, or the
        // left one when it was last - the way editor tabs behave.
        const activeTabId =
          s.activeTabId === id
            ? (tabs[index] ?? tabs[index - 1])?.id ?? null
            : s.activeTabId;
        return { tabs, activeTabId };
      }),

    closeOtherTabs: (id) =>
      set((s) =>
        s.tabs.some((t) => t.id === id)
          ? { tabs: s.tabs.filter((t) => t.id === id), activeTabId: id }
          : s,
      ),

    closeAllTabs: () => set({ tabs: [], activeTabId: null }),

    updateTab: (id, patch) => patchTab(id, patch),

    runQuery: async (sessionId, id) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      patchTab(id, { loading: true, error: null });
      try {
        if (tab.mode === "aggregate") {
          const pipeline = parseJsonArray(tab.pipelineText);
          const results = await api.runAggregate(
            sessionId,
            tab.database,
            tab.collection,
            pipeline,
          );
          patchTab(id, { results, resultsMode: "aggregate", loading: false });
        } else {
          const filter = parseJsonObject(tab.filterText);
          const sort = tab.sortText.trim() ? parseJsonObject(tab.sortText) : null;
          const results = await api.runFind(sessionId, tab.database, tab.collection, {
            filter,
            sort,
            projection: null,
            limit: tab.limit,
            skip: tab.skip,
          });
          patchTab(id, { results, resultsMode: "find", loading: false });
        }
      } catch (e) {
        patchTab(id, { error: String(e), loading: false });
      }
    },

    replaceDocument: (id, updated) => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab?.results) return;
      const key = JSON.stringify((updated as { _id?: unknown } | null)?._id);
      patchTab(id, {
        results: {
          ...tab.results,
          documents: tab.results.documents.map((d) =>
            JSON.stringify((d as { _id?: unknown } | null)?._id) === key ? updated : d,
          ),
        },
      });
    },

    closeConnection: (connectionId) =>
      set((s) => {
        const prefix = databaseKey(connectionId, "");
        const tabs = s.tabs.filter((t) => t.connection.id !== connectionId);
        const activeGone = !tabs.some((t) => t.id === s.activeTabId);
        return {
          tabs,
          activeTabId: activeGone ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId,
          databaseTree: Object.fromEntries(
            Object.entries(s.databaseTree).filter(([key]) => !key.startsWith(prefix)),
          ),
          lastDatabase:
            s.lastDatabase?.connectionId === connectionId ? null : s.lastDatabase,
        };
      }),
  };
});
