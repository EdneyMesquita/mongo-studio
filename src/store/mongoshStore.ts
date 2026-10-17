import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/tauri";
import type { MongoshDownloadProgress, MongoshInfo } from "../types/script";
import { useSettingsStore } from "./settingsStore";

interface MongoshState {
  /** What the last look found; null before the first. */
  info: MongoshInfo | null;
  detecting: boolean;
  /** The running download's progress; null when none runs. */
  download: MongoshDownloadProgress | null;
  downloadError: string | null;
  /** Looks for mongosh again (the picked path, a downloaded copy, the PATH). */
  detect: () => Promise<MongoshInfo | null>;
  /** Downloads MongoDB's build and starts using it. */
  startDownload: () => Promise<void>;
}

let listening: Promise<unknown> | null = null;

export const useMongoshStore = create<MongoshState>((set, get) => ({
  info: null,
  detecting: false,
  download: null,
  downloadError: null,

  detect: async () => {
    set({ detecting: true });
    try {
      const info = await api.mongoshDetect(useSettingsStore.getState().mongosh.path);
      set({ info });
      return info;
    } catch (e) {
      set({ info: { path: null, version: null, source: null, error: String(e), downloadSize: null } });
      return null;
    } finally {
      set({ detecting: false });
    }
  },

  startDownload: async () => {
    if (get().download) return;
    listening ??= listen<MongoshDownloadProgress>("mongosh-download", ({ payload }) => {
      if (get().download) set({ download: payload });
    });
    await listening;
    set({ download: { phase: "download", received: 0, total: get().info?.downloadSize ?? null }, downloadError: null });
    try {
      const info = await api.mongoshDownload();
      set({ info });
      // A path picked by hand would hide the copy just downloaded.
      useSettingsStore.getState().setMongosh({ path: null });
    } catch (e) {
      set({ downloadError: String(e) });
    } finally {
      set({ download: null });
    }
  },
}));

/** Megabytes, for "Download mongosh (~70 MB)". */
export function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
}
