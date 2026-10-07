import type * as Monaco from "monaco-editor";

/**
 * A console line that is mongosh's `use <db>` alone, optionally with a `;`
 * and a `//` comment after. The backend turns these lines into database
 * switches (see `rewrite_use` in src-tauri/src/scripting.rs) and this
 * matches the same lines.
 */
const USE_LINE = /^\s*use\s+[^\s;/]+\s*;?\s*(?:\/\/.*)?$/;

export function isUseLine(line: string): boolean {
  return USE_LINE.test(line);
}

/**
 * `use <db>` isn't JavaScript, so Monaco's JavaScript checker underlines
 * it. Drops its markers on those lines, and only those, whenever it sets
 * them.
 */
export function allowUseLines(monaco: typeof Monaco) {
  monaco.editor.onDidChangeMarkers((uris) => {
    for (const uri of uris) {
      const model = monaco.editor.getModel(uri);
      if (!model || model.getLanguageId() !== "javascript") continue;
      const markers = monaco.editor.getModelMarkers({ resource: uri, owner: "javascript" });
      const kept = markers.filter((m) => !isUseLine(model.getLineContent(m.startLineNumber)));
      // setting them fires this again; only set when something changes
      if (kept.length !== markers.length) monaco.editor.setModelMarkers(model, "javascript", kept);
    }
  });
}
