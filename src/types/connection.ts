export type ConnectionSource =
  | { kind: "uri"; uri: string }
  | { kind: "manual"; host: string; port: number; srv: boolean };

export type AuthMechanism =
  | "SCRAM_SHA1"
  | "SCRAM_SHA256"
  | "MONGODB_X509"
  | "MONGODB_AWS"
  | "GSSAPI";

export interface TlsOptions {
  enabled: boolean;
  caFile: string | null;
  certKeyFile: string | null;
  certKeyHasPassphrase: boolean;
  allowInvalidCertificates: boolean;
  allowInvalidHostnames: boolean;
}

export type SshAuthMethod = "password" | "private_key" | "agent";

export interface SshTunnelOptions {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath: string | null;
  privateKeyHasPassphrase: boolean;
}

export interface ConnectionAdvancedOptions {
  appName: string | null;
  connectTimeoutMs: number | null;
  serverSelectionTimeoutMs: number | null;
  maxPoolSize: number | null;
  minPoolSize: number | null;
  replicaSet: string | null;
  readPreference: string | null;
  retryWrites: boolean | null;
  directConnection: boolean | null;
  authMechanism: AuthMechanism | null;
  authSource: string | null;
}

export interface ConnectionProfile {
  id: string;
  name: string;
  source: ConnectionSource;
  database: string | null;
  username: string | null;
  hasPassword: boolean;
  tls: TlsOptions;
  sshTunnel: SshTunnelOptions | null;
  advanced: ConnectionAdvancedOptions;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionProfileInput {
  id?: string | null;
  name: string;
  source: ConnectionSource;
  database: string | null;
  username: string | null;
  password: string | null;
  tls: TlsOptions;
  tlsCertKeyPassphrase: string | null;
  sshTunnel: SshTunnelOptions | null;
  sshPassword: string | null;
  sshKeyPassphrase: string | null;
  advanced: ConnectionAdvancedOptions;
}

export interface ConnectionProfileMeta {
  id: string;
  name: string;
  summary: string;
  database: string | null;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  serverVersion: string | null;
}

export interface ConnectionHandle {
  sessionId: string;
  serverVersion: string | null;
}

export interface SecretBackendInfo {
  backend: "keyring" | "encrypted_file";
  warning: string | null;
}

export interface ConnectionsExportSummary {
  exported: number;
}

export interface ConnectionsImportSummary {
  imported: number;
  errors: string[];
  warnings: string[];
}

export interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
}

export interface CollectionInfo {
  name: string;
  collectionType: string;
}

export function emptyTlsOptions(): TlsOptions {
  return {
    enabled: false,
    caFile: null,
    certKeyFile: null,
    certKeyHasPassphrase: false,
    allowInvalidCertificates: false,
    allowInvalidHostnames: false,
  };
}

export function emptyAdvancedOptions(): ConnectionAdvancedOptions {
  return {
    appName: null,
    connectTimeoutMs: null,
    serverSelectionTimeoutMs: null,
    maxPoolSize: null,
    minPoolSize: null,
    replicaSet: null,
    readPreference: null,
    retryWrites: null,
    directConnection: null,
    authMechanism: null,
    authSource: null,
  };
}

export function emptySshTunnelOptions(): SshTunnelOptions {
  return {
    enabled: false,
    host: "",
    port: 22,
    username: "",
    authMethod: "password",
    privateKeyPath: null,
    privateKeyHasPassphrase: false,
  };
}

export function newProfileInput(): ConnectionProfileInput {
  return {
    id: null,
    name: "",
    source: { kind: "uri", uri: "" },
    database: null,
    username: null,
    password: null,
    tls: emptyTlsOptions(),
    tlsCertKeyPassphrase: null,
    sshTunnel: null,
    sshPassword: null,
    sshKeyPassphrase: null,
    advanced: emptyAdvancedOptions(),
  };
}
