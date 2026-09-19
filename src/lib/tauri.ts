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
import type {
  CollectionStats,
  FindQueryInput,
  QueryResultPage,
} from "../types/query";
import type { ScriptResult } from "../types/script";
import type { ExportOptions, ExportQueryInput, ExportSummary } from "../types/export";

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

  getCollectionStats: (sessionId: string, database: string, collection: string) =>
    invoke<CollectionStats>("get_collection_stats", { sessionId, database, collection }),

  runFind: (
    sessionId: string,
    database: string,
    collection: string,
    query: FindQueryInput,
  ) => invoke<QueryResultPage>("run_find", { sessionId, database, collection, query }),

  runAggregate: (
    sessionId: string,
    database: string,
    collection: string,
    pipeline: unknown,
  ) =>
    invoke<QueryResultPage>("run_aggregate", {
      sessionId,
      database,
      collection,
      pipeline,
    }),

  countDocuments: (
    sessionId: string,
    database: string,
    collection: string,
    filter: unknown,
  ) => invoke<number>("count_documents", { sessionId, database, collection, filter }),

  runScript: (
    sessionId: string,
    database: string,
    script: string,
    executionId: string,
    timeoutMs: number | null,
  ) =>
    invoke<ScriptResult>("run_script", {
      sessionId,
      database,
      script,
      executionId,
      timeoutMs,
    }),

  cancelScript: (executionId: string) =>
    invoke<void>("cancel_script", { executionId }),

  exportToCsv: (
    sessionId: string,
    database: string,
    collection: string,
    query: ExportQueryInput,
    options: ExportOptions,
    destPath: string,
    executionId: string,
  ) =>
    invoke<ExportSummary>("export_to_csv", {
      sessionId,
      database,
      collection,
      query,
      options,
      destPath,
      executionId,
    }),

  cancelExport: (executionId: string) =>
    invoke<void>("cancel_export", { executionId }),
};
