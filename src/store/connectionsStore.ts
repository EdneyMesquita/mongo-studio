import { create } from "zustand";
import { api } from "../lib/tauri";
import { useSessionsStore } from "./sessionsStore";
import type {
  ConnectionProfileInput,
  ConnectionProfileMeta,
  ConnectionTestResult,
  DatabaseInfo,
  SecretBackendInfo,
} from "../types/connection";

interface ActiveSession {
  connectionId: string;
  sessionId: string;
  serverVersion: string | null;
  databases: DatabaseInfo[];
}

interface ConnectionsState {
  profiles: ConnectionProfileMeta[];
  loading: boolean;
  error: string | null;
  session: ActiveSession | null;
  secretBackend: SecretBackendInfo | null;
  lastTestResult: ConnectionTestResult | null;

  refreshProfiles: () => Promise<void>;
  loadSecretBackendInfo: () => Promise<void>;
  saveProfile: (input: ConnectionProfileInput) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  testConnection: (input: ConnectionProfileInput) => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,
  session: null,
  secretBackend: null,
  lastTestResult: null,

  refreshProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const profiles = await api.listConnectionProfiles();
      set({ profiles, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  loadSecretBackendInfo: async () => {
    try {
      const secretBackend = await api.secretBackendInfo();
      set({ secretBackend });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveProfile: async (input) => {
    set({ loading: true, error: null });
    try {
      await api.saveConnectionProfile(input);
      await get().refreshProfiles();
    } catch (e) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  deleteProfile: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.deleteConnectionProfile(id);
      await get().refreshProfiles();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  testConnection: async (input) => {
    set({ loading: true, error: null, lastTestResult: null });
    try {
      const result = await api.testConnection(input);
      set({ lastTestResult: result, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  connect: async (id) => {
    const current = get().session;
    if (current && current.connectionId !== id) {
      try {
        await api.disconnect(current.sessionId);
      } catch {
        // best-effort - proceed to connect the new profile regardless
      }
      useSessionsStore.getState().reset();
      set({ session: null });
    }
    set({ loading: true, error: null });
    try {
      const handle = await api.connect(id);
      const databases = await api.listDatabases(handle.sessionId);
      set({
        session: {
          connectionId: id,
          sessionId: handle.sessionId,
          serverVersion: handle.serverVersion,
          databases,
        },
        loading: false,
      });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  disconnect: async () => {
    const session = get().session;
    if (!session) return;
    set({ loading: true, error: null });
    try {
      await api.disconnect(session.sessionId);
      useSessionsStore.getState().reset();
      set({ session: null, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
