export interface ScriptResult {
  value: unknown;
  logs: string[];
  /** Where the script ended up: its database, or the one a `use` line switched to. */
  database: string;
}

export interface ScriptLogEvent {
  executionId: string;
  message: string;
}

/** A console script saved to disk. */
export interface SavedScript {
  path: string;
  name: string;
  /** Milliseconds since the Unix epoch. */
  modifiedMs: number;
}

/** What `mongosh_detect` and `mongosh_download` report. */
export interface MongoshInfo {
  path: string | null;
  version: string | null;
  source: "custom" | "downloaded" | "path" | null;
  error: string | null;
  /** Bytes a download would fetch, when known. */
  downloadSize: number | null;
}

/** Payload of `mongosh-download`. */
export interface MongoshDownloadProgress {
  phase: "download" | "verify" | "unpack" | "done";
  received: number;
  total: number | null;
}

/** How a console script runs under mongosh (`run_script`'s mongoshOptions). */
export interface MongoshRunOptions {
  path?: string;
  extraArgs: string;
  loadRc: boolean;
}
