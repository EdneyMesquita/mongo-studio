export type ExportNestedMode = "flatten" | "stringify";

/** CSV: a row per document. JSON: an array of the documents as stored. */
export type ExportFormat = "csv" | "json";

export interface ExportQueryInput {
  filter: unknown;
  sort: unknown | null;
  projection: unknown | null;
  pipeline: unknown | null;
  limit: number | null;
}

export interface ExportOptions {
  format: ExportFormat;
  /** CSV only. */
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
