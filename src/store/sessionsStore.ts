import { create } from "zustand";
import { api } from "../lib/tauri";
import type { CollectionInfo } from "../types/connection";
import type { CollectionStats, QueryResultPage } from "../types/query";

interface SessionsState {
  collections: CollectionInfo[];
  selectedDatabase: string | null;
  selectedCollection: string | null;
  stats: CollectionStats | null;
  results: QueryResultPage | null;
  filterText: string;
  sortText: string;
  limit: number;
  skip: number;
  loading: boolean;
  error: string | null;

  selectDatabase: (sessionId: string, database: string) => Promise<void>;
  selectCollection: (
    sessionId: string,
    database: string,
    collection: string,
  ) => Promise<void>;
  setFilterText: (text: string) => void;
  setSortText: (text: string) => void;
  setLimit: (limit: number) => void;
  setSkip: (skip: number) => void;
  runQuery: (sessionId: string) => Promise<void>;
  reset: () => void;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  collections: [],
  selectedDatabase: null,
  selectedCollection: null,
  stats: null,
  results: null,
  filterText: "{}",
  sortText: "",
  limit: 50,
  skip: 0,
  loading: false,
  error: null,

  selectDatabase: async (sessionId, database) => {
    set({
      selectedDatabase: database,
      selectedCollection: null,
      stats: null,
      results: null,
      loading: true,
      error: null,
    });
    try {
      const collections = await api.listCollections(sessionId, database);
      set({ collections, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectCollection: async (sessionId, database, collection) => {
    set({
      selectedDatabase: database,
      selectedCollection: collection,
      results: null,
      loading: true,
      error: null,
    });
    try {
      const stats = await api.getCollectionStats(sessionId, database, collection);
      set({ stats, loading: false });
      await get().runQuery(sessionId);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setFilterText: (text) => set({ filterText: text }),
  setSortText: (text) => set({ sortText: text }),
  setLimit: (limit) => set({ limit }),
  setSkip: (skip) => set({ skip }),

  runQuery: async (sessionId) => {
    const { selectedDatabase, selectedCollection, filterText, sortText, limit, skip } =
      get();
    if (!selectedDatabase || !selectedCollection) return;
    set({ loading: true, error: null });
    try {
      const filter = parseJsonObject(filterText);
      const sort = sortText.trim() ? parseJsonObject(sortText) : null;
      const results = await api.runFind(sessionId, selectedDatabase, selectedCollection, {
        filter,
        sort,
        projection: null,
        limit,
        skip,
      });
      set({ results, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  reset: () =>
    set({
      collections: [],
      selectedDatabase: null,
      selectedCollection: null,
      stats: null,
      results: null,
      filterText: "{}",
      sortText: "",
      limit: 50,
      skip: 0,
      loading: false,
      error: null,
    }),
}));
