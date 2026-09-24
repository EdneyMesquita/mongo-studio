import { create } from "zustand";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/tauri";
import {
  NO_TAB_CONSOLE,
  currentConsoleTarget,
  defaultScript,
  useConsoleStore,
} from "./consoleStore";
import { useSessionsStore } from "./sessionsStore";
import { useUiStore } from "./uiStore";
import type { SavedScript } from "../types/script";

/** The file a console's script was last saved to or opened from. */
export interface ConsoleFile {
  path: string;
  name: string;
  /** What's on disk, to tell whether the console has unsaved edits. */
  savedContent: string;
}

interface ScriptsState {
  saved: SavedScript[];
  /** Linked file per console, keyed like the consoles (tab id). */
  files: Record<string, ConsoleFile>;
  saving: boolean;
  /** Last save that failed; shown in the console, next to the file name. */
  saveError: string | null;
  /** Listing or opening that failed; shown in the sidebar panel. */
  listError: string | null;

  refresh: () => Promise<void>;
  /**
   * Saves the console on screen. Overwrites the file it came from;
   * otherwise, or with `asNew`, asks where to put it - and saves to the
   * default folder under a random name if that dialog is dismissed.
   */
  save: (asNew?: boolean) => Promise<void>;
  /** Opens a saved script in the console on screen. */
  open: (script: SavedScript) => Promise<void>;
  /** Unlinks a console from its file, so its next save asks again. */
  detach: (key: string) => void;
}

/** Whether a console holds edits that aren't saved anywhere. */
export function hasUnsavedEdits(
  script: string,
  file: ConsoleFile | undefined,
  defaultText: string,
): boolean {
  return file ? script !== file.savedContent : script !== defaultText;
}

export const useScriptsStore = create<ScriptsState>((set, get) => ({
  saved: [],
  files: {},
  saving: false,
  saveError: null,
  listError: null,

  refresh: async () => {
    try {
      set({ saved: await api.listSavedScripts(), listError: null });
    } catch (e) {
      set({ listError: String(e) });
    }
  },

  save: async (asNew = false) => {
    // A second Ctrl+S while the dialog is up would open another dialog.
    if (get().saving) return;
    set({ saving: true, saveError: null });
    const { key, script: content } = currentConsoleTarget();
    try {
      let path = asNew ? null : (get().files[key]?.path ?? null);
      if (path === null) {
        const suggested = await api.suggestScriptPath();
        // null when dismissed: the backend then picks the random name
        path = await save({
          defaultPath: suggested,
          filters: [{ name: "JavaScript", extensions: ["js"] }],
        });
      }
      const saved = await api.saveScript(path, content);
      set((s) => ({
        files: {
          ...s.files,
          [key]: { path: saved.path, name: saved.name, savedContent: content },
        },
      }));
    } catch (e) {
      set({ saveError: String(e) });
      return;
    } finally {
      set({ saving: false });
    }
    // outside the try, so a listing failure can't read as a failed save
    await get().refresh();
  },

  open: async (script) => {
    const target = currentConsoleTarget();
    const tab = useSessionsStore.getState().tabs.find((t) => t.id === target.key);
    const untouched = defaultScript(target.database, tab?.collection ?? null);
    if (hasUnsavedEdits(target.script, get().files[target.key], untouched)) {
      const discard = await ask(
        `The console for ${tab ? `${tab.database}.${tab.collection}` : "this database"} has unsaved changes. Open ${script.name} and discard them?`,
        {
          title: "Unsaved changes",
          kind: "warning",
          okLabel: "Discard changes",
          cancelLabel: "Keep editing",
        },
      );
      if (!discard) return;
    }
    try {
      const content = await api.readSavedScript(script.path);
      useConsoleStore.getState().setScript(target.key, content);
      set((s) => ({
        files: {
          ...s.files,
          [target.key]: { path: script.path, name: script.name, savedContent: content },
        },
        listError: null,
      }));
      useUiStore.getState().setMainTab("console");
    } catch (e) {
      // most likely deleted since the list was loaded
      await get().refresh();
      set({ listError: `Couldn't open ${script.name}: ${String(e)}` });
    }
  },

  detach: (key) =>
    set((s) => {
      const files = { ...s.files };
      delete files[key];
      return { files };
    }),
}));

// A tab's file link goes when the tab does, like its console.
useSessionsStore.subscribe((state, prev) => {
  if (state.tabs === prev.tabs) return;
  const open = new Set(state.tabs.map((t) => t.id));
  const { files } = useScriptsStore.getState();
  const stale = Object.keys(files).filter((k) => k !== NO_TAB_CONSOLE && !open.has(k));
  if (stale.length === 0) return;
  const kept = { ...files };
  for (const key of stale) delete kept[key];
  useScriptsStore.setState({ files: kept });
});
