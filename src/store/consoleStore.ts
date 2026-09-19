import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/tauri";
import type { ScriptLogEvent } from "../types/script";

const DEFAULT_SCRIPT = `// JS console - runs against the currently selected database.
// db.collection("name") gives you find/findOne/insertOne/updateOne/deleteOne/aggregate/countDocuments.
// Top-level await is supported.
const count = await db.collection("users").countDocuments({});
count;
`;

interface ConsoleState {
  script: string;
  running: boolean;
  executionId: string | null;
  logs: string[];
  result: unknown;
  hasResult: boolean;
  error: string | null;

  setScript: (script: string) => void;
  run: (sessionId: string, database: string) => Promise<void>;
  cancel: () => Promise<void>;
}

export const useConsoleStore = create<ConsoleState>((set, get) => ({
  script: DEFAULT_SCRIPT,
  running: false,
  executionId: null,
  logs: [],
  result: null,
  hasResult: false,
  error: null,

  setScript: (script) => set({ script }),

  run: async (sessionId, database) => {
    const executionId = crypto.randomUUID();
    set({
      running: true,
      executionId,
      logs: [],
      result: null,
      hasResult: false,
      error: null,
    });
    try {
      const result = await api.runScript(
        sessionId,
        database,
        get().script,
        executionId,
        null,
      );
      if (get().executionId === executionId) {
        set({
          running: false,
          result: result.value,
          hasResult: true,
          logs: result.logs,
        });
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
    await api.cancelScript(executionId);
  },
}));

listen<ScriptLogEvent>("script-log", (event) => {
  const state = useConsoleStore.getState();
  if (event.payload.executionId !== state.executionId) return;
  useConsoleStore.setState({ logs: [...state.logs, event.payload.message] });
});
