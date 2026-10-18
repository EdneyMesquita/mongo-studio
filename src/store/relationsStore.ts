import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/tauri";
import { useConnectionsStore } from "./connectionsStore";
import type { Relation } from "../types/relations";
import { guessPattern, relationLabel } from "../lib/relations";
import { toast } from "sonner";
import { databaseKey, useSessionsStore, type TabConnection } from "./sessionsStore";

interface RelationsState {
  relations: Relation[];
  loaded: boolean;
  /**
   * The editor tabs' working copies, by relation id, until saved. A new
   * relation has a local `new-…` id here and none in `relations`.
   */
  working: Record<string, Relation>;
  /** The field a new relation was started from, to link first. */
  startField: Record<string, string>;
  /** Per relation, the From collection its editor samples (a tenant of a pattern). */
  samples: Record<string, string>;
  setSample: (relationId: string, collection: string) => void;
  setWorking: (relation: Relation) => void;
  dropWorking: (id: string) => void;
  load: () => Promise<void>;
  /** Saves it (a new one gets its id) and returns what was stored. */
  save: (relation: Relation) => Promise<Relation>;
  remove: (id: string) => Promise<void>;
}

export const useRelationsStore = create<RelationsState>((set) => ({
  relations: [],
  loaded: false,
  working: {},
  startField: {},
  samples: {},
  setSample: (relationId, collection) => set((s) => ({ samples: { ...s.samples, [relationId]: collection } })),
  setWorking: (relation) => set((s) => ({ working: { ...s.working, [relation.id]: relation } })),
  dropWorking: (id) =>
    set((s) => {
      const working = { ...s.working };
      delete working[id];
      return { working };
    }),

  load: async () => {
    set({ relations: await api.relationsList(), loaded: true });
  },

  save: async (relation) => {
    const saved = await api.relationSave(relation);
    set((s) => ({
      relations: s.relations.some((r) => r.id === saved.id)
        ? s.relations.map((r) => (r.id === saved.id ? saved : r))
        : [...s.relations, saved],
    }));
    return saved;
  },

  remove: async (id) => {
    await api.relationDelete(id);
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
  },
}));

/** A blank relation the editor fills in; saving gives it an id. */
export function blankRelation(from: Relation["from"], to?: Relation["to"]): Relation {
  return {
    id: "",
    name: "",
    from,
    to: to ?? { conn: "cluster", db: "", coll: "" },
    rules: [[]],
    ruleNotes: [],
    scope: [],
    fromName: "",
    toName: "",
    pairs: {},
    draft: null,
    createdAt: "",
    updatedAt: "",
  };
}

export const isUnsaved = (id: string) => id.startsWith("new-");

/** Where a relation tab samples from when opened from the panel: an open tab of its From side, else any live connection with its database. */
function sampleConnection(relation: Relation): { connection: TabConnection; database: string } | null {
  const { tabs } = useSessionsStore.getState();
  const fromTab = tabs.find(
    (t) => t.kind === "collection" && t.database === relation.from.db && (relation.from.conn === "any" || relation.from.conn === t.connection.id),
  );
  if (fromTab) return { connection: fromTab.connection, database: relation.from.db };
  const { profiles, sessions } = useConnectionsStore.getState();
  const tree = useSessionsStore.getState().databaseTree;
  const candidates = profiles.filter((p) => relation.from.conn === "any" || relation.from.conn === p.id);
  const live =
    candidates.find((p) => sessions[p.id] && tree[databaseKey(p.id, relation.from.db)]) ??
    candidates.find((p) => sessions[p.id]) ??
    candidates[0];
  return live ? { connection: { id: live.id, name: live.name, summary: live.summary }, database: relation.from.db } : null;
}

/** Opens a saved relation (or draft) in its editor tab. */
export function openRelationTab(relationId: string, at?: { connection: TabConnection; database: string }) {
  const relation = useRelationsStore.getState().relations.find((r) => r.id === relationId) ?? useRelationsStore.getState().working[relationId];
  if (!relation) return;
  const where = at ?? sampleConnection(relation);
  if (!where) return;
  useSessionsStore.getState().openRelation(relationId, where.connection, where.database);
}

/** Starts a new relation from a collection (and a field of it, linked first), in its own tab. */
export function startRelation(connection: TabConnection, database: string, collection: string, field?: string) {
  const siblings = useSessionsStore.getState().databaseTree[databaseKey(connection.id, database)]?.collections.map((c) => c.name) ?? [];
  const id = `new-${crypto.randomUUID()}`;
  const relation = { ...blankRelation({ conn: "any", db: database, coll: guessPattern(collection, siblings) }), id };
  useRelationsStore.setState((s) => ({
    working: { ...s.working, [id]: relation },
    startField: field ? { ...s.startField, [id]: field } : s.startField,
    samples: collection ? { ...s.samples, [id]: collection } : s.samples,
  }));
  useSessionsStore.getState().openRelation(id, connection, database);
  // the explorer hasn't listed the database: list it to tell a tenant pattern
  const session = useConnectionsStore.getState().sessions[connection.id];
  if (siblings.length === 0 && session && collection) {
    void api
      .listCollections(session.sessionId, database)
      .then((cs) => {
        const pattern = guessPattern(collection, cs.map((c) => c.name));
        const current = useRelationsStore.getState().working[id];
        // only while nobody changed it
        if (pattern !== collection && current?.from.coll === collection) {
          useRelationsStore.getState().setWorking({ ...current, from: { ...current.from, coll: pattern } });
        }
      })
      .catch(() => {});
  }
}

let started = false;

/** Loads the relations and follows changes made elsewhere (an MCP client). Called once the app has mounted. */
export function startRelations() {
  if (started) return;
  started = true;
  void useRelationsStore.getState().load().catch(() => {});
  void listen<Relation[]>("relations-changed", ({ payload }) => {
    const before = new Set(useRelationsStore.getState().relations.map((r) => r.id));
    useRelationsStore.setState({ relations: payload, loaded: true });
    // a draft an MCP client just proposed
    for (const r of payload) {
      if (!r.draft || before.has(r.id)) continue;
      toast(`${r.draft.by} proposed a relation`, {
        description: `${r.name || relationLabel(r)} - a draft until you save it.`,
        action: { label: "Open", onClick: () => openRelationTab(r.id) },
      });
    }
  });
}
