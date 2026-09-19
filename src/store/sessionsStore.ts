import { create } from "zustand";
import { api } from "../lib/tauri";
import type { CollectionInfo } from "../types/connection";
import type { CollectionStats, QueryResultPage } from "../types/query";

export type QueryMode = "find" | "aggregate";

interface SessionsState {
  collections: CollectionInfo[];
  selectedDatabase: string | null;
  selectedCollection: string | null;
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

  selectDatabase: (sessionId: string, database: string) => Promise<void>;
  selectCollection: (
    sessionId: string,
    database: string,
    collection: string,
  ) => Promise<void>;
  setMode: (mode: QueryMode) => void;
  setFilterText: (text: string) => void;
  setSortText: (text: string) => void;
  setLimit: (limit: number) => void;
  setSkip: (skip: number) => void;
  setPipelineText: (text: string) => void;
  runQuery: (sessionId: string) => Promise<void>;
  reset: () => void;
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

const initialQueryState = {
  mode: "find" as QueryMode,
  filterText: "{}",
  sortText: "",
  limit: 50,
  skip: 0,
  pipelineText: "[\n  { \"$limit\": 50 }\n]",
};

export const useSessionsStore = create<SessionsState>((set, get) => ({
  collections: [],
  selectedDatabase: null,
  selectedCollection: null,
  stats: null,
  results: null,
  ...initialQueryState,
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

  setMode: (mode) => set({ mode }),
  setFilterText: (text) => set({ filterText: text }),
  setSortText: (text) => set({ sortText: text }),
  setLimit: (limit) => set({ limit }),
  setSkip: (skip) => set({ skip }),
  setPipelineText: (text) => set({ pipelineText: text }),

  runQuery: async (sessionId) => {
    const {
      selectedDatabase,
      selectedCollection,
      mode,
      filterText,
      sortText,
      limit,
      skip,
      pipelineText,
    } = get();
    if (!selectedDatabase || !selectedCollection) return;
    set({ loading: true, error: null });
    try {
      if (mode === "aggregate") {
        const pipeline = parseJsonArray(pipelineText);
        const results = await api.runAggregate(
          sessionId,
          selectedDatabase,
          selectedCollection,
          pipeline,
        );
        set({ results, loading: false });
      } else {
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
      }
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
      ...initialQueryState,
      loading: false,
      error: null,
    }),
}));
