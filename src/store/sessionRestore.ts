import { useConnectionsStore } from "./connectionsStore";
import { useConsoleStore } from "./consoleStore";
import { useEditorLayoutStore } from "./editorLayoutStore";
import { useScriptsStore, type ConsoleFile } from "./scriptsStore";
import { type Tab, TabKind, type TabQueryFields, useSessionsStore } from "./sessionsStore";
import { useSettingsStore } from "./settingsStore";
import { useUiStore, type MainTab } from "./uiStore";

/**
 * "Reopen last session's tabs on launch": the open tabs are kept as they
 * change, and put back at the next launch as dormant tabs that connect -
 * and run their query - only when they're opened.
 */

const STORAGE_KEY = "mongo-studio-last-session";

type SavedTab =
  | ({ kind: TabKind.Collection; id: string; connectionId: string; database: string; collection: string; view?: MainTab } & TabQueryFields)
  | {
      kind: TabKind.Console;
      id: string;
      connectionId: string;
      database: string;
      collection: string | null;
      number: number;
      script: string | null;
      file: ConsoleFile | null;
    }
  | { kind: TabKind.Relation; id: string; connectionId: string; database: string; relationId: string };

interface SavedSession {
  version: 1;
  activeTabId: string | null;
  tabs: SavedTab[];
}

function snapshot(): SavedSession {
  const { tabs, activeTabId } = useSessionsStore.getState();
  const { consoles } = useConsoleStore.getState();
  const { files } = useScriptsStore.getState();
  const { mainTabs } = useUiStore.getState();
  return {
    version: 1,
    activeTabId,
    tabs: tabs.map((t): SavedTab =>
      t.kind === TabKind.Collection
        ? {
            kind: TabKind.Collection,
            id: t.id,
            connectionId: t.connection.id,
            database: t.database,
            collection: t.collection,
            view: mainTabs[t.id],
            mode: t.mode,
            filterText: t.filterText,
            sortText: t.sortText,
            limit: t.limit,
            skip: t.skip,
            pipelineText: t.pipelineText,
          }
        : t.kind === TabKind.Relation
        ? { kind: TabKind.Relation, id: t.id, connectionId: t.connection.id, database: t.database, relationId: t.relationId }
        : {
            kind: TabKind.Console,
            id: t.id,
            connectionId: t.connection.id,
            database: t.database,
            collection: t.collection,
            number: t.number,
            script: consoles[t.id]?.script ?? null,
            file: files[t.id] ?? null,
          },
    ),
  };
}

function read(): SavedSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedSession | null;
    return value?.version === 1 && Array.isArray(value.tabs) ? value : null;
  } catch {
    return null;
  }
}

function write(session: SavedSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the tabs just won't come back
  }
}

/** Puts the saved tabs back, dormant, for the connections that still exist. */
function restore() {
  const saved = read();
  if (!saved || !useSettingsStore.getState().reopenTabs) return;
  const profiles = new Map(useConnectionsStore.getState().profiles.map((p) => [p.id, p]));
  const tabs: Tab[] = [];
  const scripts: Record<string, string> = {};
  const files: Record<string, ConsoleFile> = {};
  const views: Record<string, MainTab> = {};
  for (const s of saved.tabs) {
    const p = profiles.get(s.connectionId);
    if (!p) continue;
    const connection = { id: p.id, name: p.name, summary: p.summary };
    if (s.kind === TabKind.Collection) {
      tabs.push({
        kind: TabKind.Collection,
        id: s.id,
        connection,
        database: s.database,
        collection: s.collection,
        stats: null,
        results: null,
        resultsMode: null,
        queryMs: null,
        mode: s.mode,
        filterText: s.filterText,
        sortText: s.sortText,
        limit: s.limit,
        skip: s.skip,
        pipelineText: s.pipelineText,
        loading: false,
        error: null,
        dormant: true,
      });
      if (s.view) views[s.id] = s.view;
    } else if (s.kind === TabKind.Relation) {
      tabs.push({ kind: TabKind.Relation, id: s.id, connection, database: s.database, collection: null, relationId: s.relationId, dormant: true });
    } else {
      tabs.push({
        kind: TabKind.Console,
        id: s.id,
        connection,
        database: s.database,
        collection: s.collection,
        number: s.number,
        dormant: true,
      });
      if (s.script !== null) scripts[s.id] = s.script;
      if (s.file) files[s.id] = s.file;
    }
  }
  if (tabs.length === 0) return;
  for (const [id, script] of Object.entries(scripts)) useConsoleStore.getState().setScript(id, script);
  useScriptsStore.setState((st) => ({ files: { ...files, ...st.files } }));
  for (const [id, view] of Object.entries(views)) useUiStore.getState().setMainTab(id, view);
  useSessionsStore.getState().restoreTabs(tabs, saved.activeTabId);
}

/** The tabs on screen: the active one, and every pane's in a split. */
function shownTabIds(): string[] {
  const { activeTabId } = useSessionsStore.getState();
  const { panes } = useEditorLayoutStore.getState();
  return [...new Set([activeTabId, ...panes].filter((id): id is string => Boolean(id)))];
}

/**
 * Wakes the dormant tabs on screen: those whose connection is live run
 * now; the others start connecting, and run once it's up.
 */
function wakeShown() {
  const { tabs, wakeTab } = useSessionsStore.getState();
  const connections = useConnectionsStore.getState();
  for (const id of shownTabIds()) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab?.dormant) continue;
    const session = connections.sessions[tab.connection.id];
    if (session) void wakeTab(session.sessionId, tab.id);
    // A failed connect waits for Retry rather than looping.
    else if (!connections.connecting[tab.connection.id] && !connections.connectErrors[tab.connection.id]) {
      void connections.connect(tab.connection.id);
    }
  }
}

/** Reconnects a dormant tab's connection after a failed try. */
export function retryDormantTab(connectionId: string) {
  void useConnectionsStore.getState().connect(connectionId);
}

let started = false;

/**
 * Restores the last session once the saved connections are known, then
 * keeps the open tabs saved and wakes dormant ones as they're opened.
 * Called once the app has mounted.
 */
export function startSessionRestore() {
  if (started) return;
  started = true;

  let restored = false;
  let pending: number | null = null;
  const save = () => {
    // Nothing is saved before the restore, which would overwrite it with no tabs.
    if (!restored) return;
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = null;
      write(useSettingsStore.getState().reopenTabs ? snapshot() : null);
    }, 300);
  };

  const begin = () => {
    if (restored) return;
    restored = true;
    restore();
    wakeShown();
    save();
  };
  if (useConnectionsStore.getState().profilesLoaded) begin();
  else {
    const stop = useConnectionsStore.subscribe((s) => {
      if (!s.profilesLoaded) return;
      stop();
      begin();
    });
  }

  useSessionsStore.subscribe((s, prev) => {
    if (s.tabs !== prev.tabs) save();
    if (s.activeTabId !== prev.activeTabId) {
      save();
      wakeShown();
    }
  });
  useEditorLayoutStore.subscribe((s, prev) => {
    if (s.panes !== prev.panes) wakeShown();
  });
  useConnectionsStore.subscribe((s, prev) => {
    if (s.sessions !== prev.sessions) wakeShown();
  });
  useConsoleStore.subscribe((s, prev) => {
    if (s.consoles !== prev.consoles) save();
  });
  useScriptsStore.subscribe((s, prev) => {
    if (s.files !== prev.files) save();
  });
  useUiStore.subscribe((s, prev) => {
    if (s.mainTabs !== prev.mainTabs) save();
  });
  useSettingsStore.subscribe((s, prev) => {
    if (s.reopenTabs !== prev.reopenTabs) save();
  });
}
