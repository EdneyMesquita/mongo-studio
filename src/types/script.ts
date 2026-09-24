export interface ScriptResult {
  value: unknown;
  logs: string[];
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
