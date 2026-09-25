import { invoke } from "@tauri-apps/api/core";
import type {
  CollectionInfo,
  ConnectionHandle,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionProfileMeta,
  ConnectionImportPreview,
  ConnectionTestResult,
  ConnectionsExportSummary,
  ConnectionsImportSummary,
  DatabaseInfo,
  SecretBackendInfo,
} from "../types/connection";
import type {
  CollectionStats,
  FindQueryInput,
  QueryResultPage,
} from "../types/query";
import type { SavedScript, ScriptResult } from "../types/script";
import type { ExportOptions, ExportQueryInput, ExportSummary } from "../types/export";
import type { ExplainQueryInput, ExplainVerbosity } from "../types/explain";

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

  exportConnections: (destPath: string, includeSecrets: boolean) =>
    invoke<ConnectionsExportSummary>("export_connections", {
      destPath,
      includeSecrets,
    }),

  previewConnectionsImport: (srcPath: string) =>
    invoke<ConnectionImportPreview[]>("preview_connections_import", { srcPath }),

  /** Imports the connections at `selected` positions of the file. */
  importConnections: (srcPath: string, selected: number[]) =>
    invoke<ConnectionsImportSummary>("import_connections", { srcPath, selected }),

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

  /** Sets one field of the document with this _id; returns it as stored. */
  updateField: (
    sessionId: string,
    database: string,
    collection: string,
    id: unknown,
    path: string[],
    value: unknown,
  ) =>
    invoke<unknown>("update_field", { sessionId, database, collection, id, path, value }),

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

  /** The sidebar's folder tree as stored, or null before one was saved. */
  getSidebarLayout: () => invoke<unknown>("get_sidebar_layout"),

  saveSidebarLayout: (layout: unknown) => invoke<void>("save_sidebar_layout", { layout }),

  suggestScriptPath: () => invoke<string>("suggest_script_path"),

  /** With a null path the backend picks a random name in the default folder. */
  saveScript: (path: string | null, content: string) =>
    invoke<SavedScript>("save_script", { path, content }),

  listSavedScripts: () => invoke<SavedScript[]>("list_saved_scripts"),

  readSavedScript: (path: string) => invoke<string>("read_saved_script", { path }),

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

  listIndexStats: (sessionId: string, database: string, collection: string) =>
    invoke<unknown[]>("list_index_stats", { sessionId, database, collection }),

  explainQuery: (
    sessionId: string,
    database: string,
    collection: string,
    query: ExplainQueryInput,
    verbosity: ExplainVerbosity,
  ) =>
    invoke<unknown>("explain_query", {
      sessionId,
      database,
      collection,
      query,
      verbosity,
    }),
};
