import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/tauri";
import type { ExportNestedMode, ExportProgressEvent, ExportSummary } from "../types/export";

interface ExportState {
  running: boolean;
  rowsWritten: number;
  summary: ExportSummary | null;
  error: string | null;
  executionId: string | null;

  start: (
    sessionId: string,
    database: string,
    collection: string,
    query: {
      filter: unknown;
      sort: unknown | null;
      pipeline: unknown | null;
      limit: number | null;
    },
    nestedMode: ExportNestedMode,
    suggestedName: string,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export const useExportStore = create<ExportState>((set, get) => ({
  running: false,
  rowsWritten: 0,
  summary: null,
  error: null,
  executionId: null,

  start: async (sessionId, database, collection, query, nestedMode, suggestedName) => {
    const destPath = await save({
      defaultPath: suggestedName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!destPath) return;

    const executionId = crypto.randomUUID();
    set({
      running: true,
      rowsWritten: 0,
      summary: null,
      error: null,
      executionId,
    });
    try {
      const summary = await api.exportToCsv(
        sessionId,
        database,
        collection,
        {
          filter: query.filter,
          sort: query.sort,
          projection: null,
          pipeline: query.pipeline,
          limit: query.limit,
        },
        { nestedMode, sampleSize: null },
        destPath,
        executionId,
      );
      if (get().executionId === executionId) {
        set({ running: false, summary });
      }
    } catch (e) {
      if (get().executionId === executionId) {
        set({ running: false, error: String(e) });
      }
    }
  },

  cancel: async () => {
    const executionId = get().executionId;
    if (!executionId) return;
    await api.cancelExport(executionId);
  },

  reset: () =>
    set({ running: false, rowsWritten: 0, summary: null, error: null, executionId: null }),
}));

listen<ExportProgressEvent>("export-progress", (event) => {
  const state = useExportStore.getState();
  if (event.payload.executionId !== state.executionId) return;
  useExportStore.setState({ rowsWritten: event.payload.rowsWritten });
});
