export interface ScriptResult {
  value: unknown;
  logs: string[];
}

export interface ScriptLogEvent {
  executionId: string;
  message: string;
}
