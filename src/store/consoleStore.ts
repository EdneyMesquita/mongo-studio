import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/tauri";
import { useConnectionsStore } from "./connectionsStore";
import { selectActiveTab, selectCurrentDatabase, useSessionsStore } from "./sessionsStore";
import type { ScriptLogEvent } from "../types/script";

/** Key of the console used while no collection tab is open. */
export const NO_TAB_CONSOLE = "";

/** The script a console starts with, pointed at its own collection. */
export function defaultScript(database: string | null, collection: string | null): string {
  const header = `// db.collection("name") gives you find/findOne/insertOne/updateOne/deleteOne/aggregate/countDocuments.
// Top-level await is supported.`;
  if (database && collection) {
    return `// Console for ${database}.${collection} - runs against the "${database}" database.
${header}
const docs = await db.collection(${JSON.stringify(collection)}).find({}, { limit: 20 });
docs;
`;
  }
  return `// JS console - runs against the currently selected database.
${header}
const count = await db.collection("users").countDocuments({});
count;
`;
}

/**
 * The console on screen: the active tab's, scoped to its collection, or the
 * shared one while no tab is open - with its script, the default one until
 * edited. Read from the stores at call time, so it suits callbacks bound
 * once, like Monaco commands.
 */
export function currentConsoleTarget() {
  const { sessions } = useConnectionsStore.getState();
  const state = useSessionsStore.getState();
  const tab = selectActiveTab(state);
  const current = selectCurrentDatabase(state);
  let session = current ? sessions[current.connectionId] : undefined;
  let database = current?.database ?? null;
  if (!session) {
    // nothing picked yet: the first connection's first database
    session = Object.values(sessions)[0];
    database = session?.databases[0]?.name ?? null;
  }
  const key = tab?.id ?? NO_TAB_CONSOLE;
  const stored = useConsoleStore.getState().consoles[key]?.script;
  return {
    session: session ?? null,
    database,
    key,
    script: stored ?? defaultScript(database, tab?.collection ?? null),
  };
}

export interface ConsoleSession {
  /** Null until edited: the console shows its default script until then. */
  script: string | null;
  running: boolean;
  executionId: string | null;
  logs: string[];
  result: unknown;
  hasResult: boolean;
  error: string | null;
}

const blankSession: ConsoleSession = {
  script: null,
  running: false,
  executionId: null,
  logs: [],
  result: null,
  hasResult: false,
  error: null,
};

interface ConsoleState {
  /** One console per collection tab, keyed by tab id, plus NO_TAB_CONSOLE. */
  consoles: Record<string, ConsoleSession>;

  setScript: (key: string, script: string) => void;
  run: (key: string, sessionId: string, database: string, script: string) => Promise<void>;
  cancel: (key: string) => Promise<void>;
}

export const useConsoleStore = create<ConsoleState>((set, get) => {
  function patch(key: string, changes: Partial<ConsoleSession>) {
    set((s) => ({
      consoles: {
        ...s.consoles,
        [key]: { ...(s.consoles[key] ?? blankSession), ...changes },
      },
    }));
  }

  return {
    consoles: {},

    setScript: (key, script) => patch(key, { script }),

    run: async (key, sessionId, database, script) => {
      const executionId = crypto.randomUUID();
      patch(key, {
        script,
        running: true,
        executionId,
        logs: [],
        result: null,
        hasResult: false,
        error: null,
      });
      // A run whose console was closed, or re-run, meanwhile is dropped.
      const stillCurrent = () => get().consoles[key]?.executionId === executionId;
      try {
        const result = await api.runScript(sessionId, database, script, executionId, null);
        if (stillCurrent()) {
          patch(key, { running: false, result: result.value, hasResult: true, logs: result.logs });
        }
      } catch (e) {
        if (stillCurrent()) patch(key, { running: false, error: String(e) });
      }
    },

    cancel: async (key) => {
      const executionId = get().consoles[key]?.executionId;
      if (!executionId) return;
      await api.cancelScript(executionId);
    },
  };
});

// A tab's console goes when the tab does, including when a disconnect
// closes them all.
useSessionsStore.subscribe((state, prev) => {
  if (state.tabs === prev.tabs) return;
  const open = new Set(state.tabs.map((t) => t.id));
  const { consoles } = useConsoleStore.getState();
  const stale = Object.keys(consoles).filter((k) => k !== NO_TAB_CONSOLE && !open.has(k));
  if (stale.length === 0) return;
  const kept = { ...consoles };
  for (const key of stale) delete kept[key];
  useConsoleStore.setState({ consoles: kept });
});

listen<ScriptLogEvent>("script-log", (event) => {
  const { consoles } = useConsoleStore.getState();
  const key = Object.keys(consoles).find(
    (k) => consoles[k].executionId === event.payload.executionId,
  );
  if (key === undefined) return;
  useConsoleStore.setState({
    consoles: {
      ...consoles,
      [key]: { ...consoles[key], logs: [...consoles[key].logs, event.payload.message] },
    },
  });
});
