import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import { registerMongoCompletion } from "./monacoCompletion";

// Bundle Monaco (and its web workers) via Vite instead of letting
// @monaco-editor/react fetch them from a CDN at runtime - this app needs to
// work fully offline against local/private databases. The package's
// `exports` map is `"./*.js": "./esm/vs/*.js"`, so subpaths must omit the
// `esm/vs` prefix (and keep the `.js` extension) or resolution fails.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });
registerMongoCompletion(monaco);
