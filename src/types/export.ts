export type ExportNestedMode = "flatten" | "stringify";

export interface ExportQueryInput {
  filter: unknown;
  sort: unknown | null;
  projection: unknown | null;
  pipeline: unknown | null;
  limit: number | null;
}

export interface ExportOptions {
  nestedMode: ExportNestedMode;
  sampleSize: number | null;
}

export interface ExportSummary {
  rowsWritten: number;
  columns: string[];
}

export interface ExportProgressEvent {
  executionId: string;
  rowsWritten: number;
}
