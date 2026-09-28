import { createContext } from "react";

/** The value an edit last wrote, so the rows showing it can flash. */
export interface SavedValue {
  /** `documentKey` of the document written. */
  docKey: string;
  /** Dotted field path within it. */
  path: string;
  /** When it was saved; a new save of the same field restarts the flash. */
  at: number;
}

export interface ValueEditor {
  /** Writes `value` (Extended JSON) at `path` in `doc`; rejects with a message. */
  commit: (doc: unknown, path: string[], value: unknown) => Promise<void>;
  /** The last successful write, for about as long as its flash lasts. */
  saved: SavedValue | null;
}

/**
 * Present only where values can be written back - Browse results that came
 * from a find. Without it (console output, aggregate results) every value
 * renders read-only.
 */
export const ValueEditContext = createContext<ValueEditor | null>(null);
