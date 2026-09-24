import { create } from "zustand";
import { api } from "../lib/tauri";
import type { CollectionInfo } from "../types/connection";
import type { CollectionStats, QueryResultPage } from "../types/query";

export type QueryMode = "find" | "aggregate";

/** One open collection, with its own query, results and stats. */
export interface CollectionTab {
  id: string;
  database: string;
  collection: string;
  stats: CollectionStats | null;
  results: QueryResultPage | null;
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

interface SessionsState {
  /** Collections of `collectionsDatabase`, listed in the sidebar tree. */
  collections: CollectionInfo[];
  collectionsDatabase: string | null;
  collectionsLoading: boolean;
  collectionsError: string | null;
  /**
   * Which database shows its collections in the sidebar. Purely visual:
   * collapsing a database leaves every tab open on it alone.
   */
  expandedDatabase: string | null;
  tabs: CollectionTab[];
  activeTabId: string | null;

  toggleDatabase: (sessionId: string, database: string) => Promise<void>;
  /** Focuses the collection's tab, opening one if it has none yet. */
  openCollection: (
    sessionId: string,
    database: string,
    collection: string,
  ) => Promise<void>;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<TabQueryFields>) => void;
  runQuery: (sessionId: string, id: string) => Promise<void>;
  reset: () => void;
}

/** Database names can't contain dots, so this is unique per collection. */
export function tabIdFor(database: string, collection: string): string {
  return `${database}.${collection}`;
}

export function selectActiveTab(state: SessionsState): CollectionTab | null {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

/**
 * The database the console should run against: the active tab's, else the
 * one last opened in the sidebar.
 */
export function selectCurrentDatabase(state: SessionsState): string | null {
  return selectActiveTab(state)?.database ?? state.collectionsDatabase;
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

function newTab(database: string, collection: string): CollectionTab {
  return {
    id: tabIdFor(database, collection),
    database,
    collection,
    stats: null,
    results: null,
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
  collections: [] as CollectionInfo[],
  collectionsDatabase: null as string | null,
  collectionsLoading: false,
  collectionsError: null as string | null,
  expandedDatabase: null as string | null,
  tabs: [] as CollectionTab[],
  activeTabId: null as string | null,
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

    toggleDatabase: async (sessionId, database) => {
      const { expandedDatabase, collectionsDatabase } = get();
      if (expandedDatabase === database) {
        set({ expandedDatabase: null });
        return;
      }
      // Reopening the database already loaded: its collections are still in
      // hand, so just show them again.
      if (collectionsDatabase === database) {
        set({ expandedDatabase: database });
        return;
      }
      set({
        expandedDatabase: database,
        collectionsDatabase: database,
        collections: [],
        collectionsLoading: true,
        collectionsError: null,
      });
      try {
        const collections = await api.listCollections(sessionId, database);
        // Another database may have been opened while this one loaded.
        if (get().collectionsDatabase === database) {
          set({ collections, collectionsLoading: false });
        }
      } catch (e) {
        if (get().collectionsDatabase !== database) return;
        // Forget which database is loaded so the next toggle retries.
        set({
          collectionsError: String(e),
          collectionsLoading: false,
          collectionsDatabase: null,
        });
      }
    },

    openCollection: async (sessionId, database, collection) => {
      const id = tabIdFor(database, collection);
      if (get().tabs.some((t) => t.id === id)) {
        set({ activeTabId: id });
        return;
      }
      set((s) => ({
        tabs: [...s.tabs, { ...newTab(database, collection), loading: true }],
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
          patchTab(id, { results, loading: false });
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
          patchTab(id, { results, loading: false });
        }
      } catch (e) {
        patchTab(id, { error: String(e), loading: false });
      }
    },

    reset: () => set(initialState),
  };
});
