import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/tauri";
import type {
  ExportFormat,
  ExportNestedMode,
  ExportProgressEvent,
  ExportQueryInput,
  ExportSummary,
} from "../types/export";

/** What an export writes: a collection's whole query, or a value in hand. */
export type ExportSource =
  | {
      kind: "query";
      sessionId: string;
      database: string;
      collection: string;
      query: Omit<ExportQueryInput, "projection">;
    }
  | { kind: "value"; value: unknown };

export interface ExportChoice {
  format: ExportFormat;
  nestedMode: ExportNestedMode;
}

interface ExportState {
  running: boolean;
  rowsWritten: number;
  summary: ExportSummary | null;
  error: string | null;
  executionId: string | null;

  /** Asks where to save (suggesting `baseName` + the format's extension), then writes. */
  start: (source: ExportSource, choice: ExportChoice, baseName: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

const FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  csv: { name: "CSV", extensions: ["csv"] },
  json: { name: "JSON", extensions: ["json"] },
};

export const useExportStore = create<ExportState>((set, get) => ({
  running: false,
  rowsWritten: 0,
  summary: null,
  error: null,
  executionId: null,

  start: async (source, { format, nestedMode }, baseName) => {
    const destPath = await save({
      defaultPath: `${baseName}.${format}`,
      filters: [FILTERS[format]],
    });
    if (!destPath) return;

    const executionId = crypto.randomUUID();
    set({ running: true, rowsWritten: 0, summary: null, error: null, executionId });
    const options = { format, nestedMode, sampleSize: null };
    try {
      const summary =
        source.kind === "query"
          ? await api.exportQuery(
              source.sessionId,
              source.database,
              source.collection,
              { ...source.query, projection: null },
              options,
              destPath,
              executionId,
            )
          : await api.exportValue(source.value, options, destPath);
      if (get().executionId === executionId) set({ running: false, summary });
    } catch (e) {
      if (get().executionId === executionId) set({ running: false, error: String(e) });
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
