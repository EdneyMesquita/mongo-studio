import { invoke } from "@tauri-apps/api/core";
import type {
  CollectionInfo,
  ConnectionHandle,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionProfileMeta,
  ConnectionTestResult,
  DatabaseInfo,
  SecretBackendInfo,
} from "../types/connection";

export const api = {
  listConnectionProfiles: () =>
    invoke<ConnectionProfileMeta[]>("list_connection_profiles"),

  getConnectionProfile: (id: string) =>
    invoke<ConnectionProfile>("get_connection_profile", { id }),

  saveConnectionProfile: (input: ConnectionProfileInput) =>
    invoke<ConnectionProfileMeta>("save_connection_profile", { input }),

  deleteConnectionProfile: (id: string) =>
    invoke<void>("delete_connection_profile", { id }),

  testConnection: (input: ConnectionProfileInput) =>
    invoke<ConnectionTestResult>("test_connection", { input }),

  connect: (id: string) => invoke<ConnectionHandle>("connect", { id }),

  disconnect: (sessionId: string) =>
    invoke<void>("disconnect", { sessionId }),

  secretBackendInfo: () =>
    invoke<SecretBackendInfo>("secret_backend_info"),

  listDatabases: (sessionId: string) =>
    invoke<DatabaseInfo[]>("list_databases", { sessionId }),

  listCollections: (sessionId: string, database: string) =>
    invoke<CollectionInfo[]>("list_collections", { sessionId, database }),
};
