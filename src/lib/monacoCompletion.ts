import type * as Monaco from "monaco-editor";
import { suggest } from "./mongoCompletion";
import type { CompletionEditor, SuggestionKind } from "./mongoCompletion";
import { completionSource } from "./completionData";

/** Where an editor's completions look names up, read when completion runs. */
export interface CompletionContext {
  sessionId: string;
  database: string;
  /** The collection an editor queries; the console reads it from its text. */
  collection: string | null;
}

export interface CompletionTarget {
  editor: CompletionEditor;
  context: () => CompletionContext | null;
}

// Providers are registered per language, for every editor at once, so each
// editor registers its model here to say what kind of text it holds.
const targets = new Map<string, CompletionTarget>();

/** Enables completion for a model; call the returned function on unmount. */
export function attachCompletion(model: Monaco.editor.ITextModel, target: CompletionTarget) {
  targets.set(model.id, target);
  return () => {
    targets.delete(model.id);
  };
}

/**
 * The console runtime's API (src-tauri/src/scripting.rs), for Monaco's
 * TypeScript service: it completes `db.collection(...)`, the collection
 * methods and find's options, with signatures and docs. Only what the
 * runtime implements - mongosh-only calls would fail when run.
 */
const CONSOLE_API = `
interface MongoStudioFindOptions {
  /** Maximum number of documents. */
  limit?: number;
  /** Documents to skip. */
  skip?: number;
  /** Sort document, e.g. { createdAt: -1 }. */
  sort?: Record<string, 1 | -1>;
  /** Fields to include (1) or exclude (0). */
  projection?: Record<string, 0 | 1 | boolean>;
}
interface MongoStudioCollection {
  /** Documents matching the filter. */
  find(filter?: object, options?: MongoStudioFindOptions): Promise<any[]>;
  /** The first document matching the filter, or null. */
  findOne(filter?: object): Promise<any | null>;
  /** How many documents match the filter. */
  countDocuments(filter?: object): Promise<number>;
  /** Runs an aggregation pipeline. */
  aggregate(pipeline?: object[]): Promise<any[]>;
  insertOne(document: object): Promise<{ insertedId: any }>;
  updateOne(
    filter: object,
    update: object,
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId: any }>;
  deleteOne(filter: object): Promise<{ deletedCount: number }>;
}
interface MongoStudioDb {
  /** A collection of the console's database. */
  collection(name: string): MongoStudioCollection;
  /** Same as collection(name). */
  getCollection(name: string): MongoStudioCollection;
}
declare const db: MongoStudioDb;
declare function ObjectId(hex: string): { $oid: string };
declare function ISODate(isoDate: string): { $date: string };
/** Logs its arguments to the console output. */
declare function print(...values: unknown[]): void;
`;

function itemKind(monaco: typeof Monaco, kind: SuggestionKind) {
  const k = monaco.languages.CompletionItemKind;
  switch (kind) {
    case "collection":
      return k.Module;
    case "field":
      return k.Field;
    case "operator":
      return k.Operator;
    case "stage":
      return k.Keyword;
    case "variable":
      return k.Variable;
  }
}

/** Registers MongoDB completion for JSON editors and the script console. */
export function registerMongoCompletion(monaco: typeof Monaco) {
  for (const language of ["json", "javascript"]) {
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ["$", '"', "'"],
      async provideCompletionItems(model, position) {
        const target = targets.get(model.id);
        const context = target?.context();
        if (!target || !context) return { suggestions: [] };

        const textBefore = model.getValueInRange(
          new monaco.Range(1, 1, position.lineNumber, position.column),
        );
        const result = await suggest(
          textBefore,
          target.editor,
          context.collection,
          completionSource(context.sessionId, context.database),
        );
        // a token never spans lines; clamp in case of an unterminated string
        const startColumn = Math.max(1, position.column - result.replaceLength);
        const range = new monaco.Range(
          position.lineNumber,
          startColumn,
          position.lineNumber,
          position.column,
        );
        return {
          suggestions: result.items.map((item) => ({
            label: { label: item.label, description: item.detail },
            kind: itemKind(monaco, item.kind),
            insertText: item.insertText,
            filterText: item.label,
            detail: item.detail,
            documentation: item.documentation,
            sortText: item.sortText,
            range,
          })),
        };
      },
    });
  }

  monaco.typescript.javascriptDefaults.addExtraLib(CONSOLE_API, "mongo-studio-console.d.ts");
}
