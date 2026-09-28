import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { lineDiff } from "../../lib/assistant/diff";
import { currentConsoleTarget, useConsoleStore } from "../../store/consoleStore";
import { useThemeStore } from "../../store/themeStore";
import { monacoTheme } from "../../lib/themes";
import { attachCompletion } from "../../lib/monacoCompletion";
import { addEditorCommand } from "../../lib/monaco";

interface ConsoleEditorProps {
  /** The console's key, its tab id. */
  consoleKey: string;
  script: string;
  /** Bound once per mount; must read what it runs at call time. */
  onRun: () => void;
  /** A script the Assistant proposes: shown read-only, added lines marked, until accepted or rejected. */
  proposal?: { original: string; text: string } | null;
}

/** DESIGN.md code style: 13px mono on a 20px line, no ligatures. */
const FONT_FAMILY = '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** The console's Monaco editor, with Mongo completion and Ctrl+Enter to run. */
export function ConsoleEditor({ consoleKey: key, script, onRun, proposal }: ConsoleEditorProps) {
  const themeId = useThemeStore((s) => s.themeId);
  const setScript = useConsoleStore((s) => s.setScript);
  const detachCompletion = useRef<(() => void) | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => () => detachCompletion.current?.(), []);

  // Mark the lines a proposal adds; clear them once it's accepted or rejected.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    decorations.current?.clear();
    if (!proposal) return;
    const { added } = lineDiff(proposal.original, proposal.text);
    decorations.current = editor.createDecorationsCollection(
      added.map((line) => ({
        range: { startLineNumber: line + 1, startColumn: 1, endLineNumber: line + 1, endColumn: 1 },
        options: { isWholeLine: true, className: "assistant-added-line", linesDecorationsClassName: "assistant-added-gutter" },
      })),
    );
    if (added.length) editor.revealLineInCenterIfOutsideViewport(added[0] + 1);
  }, [proposal]);

  return (
    <div className="h-full bg-editor">
      <Editor
        // Remounted per console rather than switched with `path`: the
        // wrapper applies a new `value` and a new `path` in separate
        // effects, so on a tab switch it wrote the incoming script into
        // the outgoing tab's model, cross-wiring the two buffers.
        key={key}
        language="javascript"
        theme={monacoTheme(themeId)}
        value={proposal ? proposal.text : script}
        onChange={(value) => {
          if (!proposal) setScript(key, value ?? "");
        }}
        options={{
          minimap: { enabled: false },
          fontFamily: FONT_FAMILY,
          fontSize: 13,
          lineHeight: 20,
          fontLigatures: false,
          padding: { top: 8, bottom: 8 },
          scrollBeyondLastLine: false,
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          // follow the divider, not only the window
          automaticLayout: true,
          readOnly: !!proposal,
          lineDecorationsWidth: 14,
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          // Measured with a fallback font if the bundled one wasn't loaded
          // yet; measure again once it is.
          void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());
          // The editor remounts per tab (key={key}); let go of the
          // previous tab's model before registering this one.
          detachCompletion.current?.();
          const model = editor.getModel();
          if (model) {
            detachCompletion.current = attachCompletion(model, {
              editor: "console",
              // the collection comes from db.collection("…") in the text
              context: () => {
                const target = currentConsoleTarget();
                return target?.session
                  ? {
                      sessionId: target.session.sessionId,
                      database: target.database,
                      collection: null,
                    }
                  : null;
              },
            });
          }
          addEditorCommand(editor, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
        }}
      />
    </div>
  );
}
