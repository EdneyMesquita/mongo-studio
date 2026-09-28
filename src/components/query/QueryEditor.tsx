import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useThemeStore } from "../../store/themeStore";
import { monacoTheme } from "../../lib/themes";
import { attachCompletion } from "../../lib/monacoCompletion";
import { addEditorCommand } from "../../lib/monaco";
import type { CompletionContext } from "../../lib/monacoCompletion";
import { cn } from "@/lib/utils";
import { QueryField } from "./QueryField";

/** DESIGN.md data style: 12.5px mono on a 20px line, no ligatures. */
const FONT_FAMILY = '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const LINE_HEIGHT = 20;
/** One line plus 4px above and below fills the 30px field (1px borders). */
const LINE_PADDING = 4;
const PIPELINE_PADDING = 6;
/** The pipeline field grows with its text between these heights. */
const MIN_PIPELINE_HEIGHT = 3 * LINE_HEIGHT + 2 * PIPELINE_PADDING;
const MAX_PIPELINE_HEIGHT = 12 * LINE_HEIGHT + 2 * PIPELINE_PADDING;

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** What the text is, which decides what completion offers. */
  kind: "filter" | "sort" | "pipeline";
  /** Read when completion runs, so it always sees the current collection. */
  completionContext: () => CompletionContext | null;
  /** Runs the query: Enter on one line, Ctrl/Cmd+Enter on several. */
  onSubmit: () => void;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel: string;
  /** Caption inside a one-line field ("filter", "sort"). */
  label?: string;
  /** Inside a one-line field, after the text: e.g. the Assistant's button. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * A JSON editor sized like a query field: syntax colours, invalid JSON
 * underlined, and MongoDB completion (fields, operators, stages).
 */
export function QueryEditor({
  value,
  onChange,
  kind,
  completionContext,
  onSubmit,
  placeholder,
  multiline = false,
  ariaLabel,
  label,
  trailing,
  className,
}: QueryEditorProps) {
  const themeId = useThemeStore((s) => s.themeId);
  // Monaco binds commands and providers once, at mount; refs let them reach
  // the latest callbacks instead of the first render's.
  const submitRef = useRef(onSubmit);
  const contextRef = useRef(completionContext);
  submitRef.current = onSubmit;
  contextRef.current = completionContext;
  const detach = useRef<(() => void) | null>(null);
  const [pipelineHeight, setPipelineHeight] = useState(MIN_PIPELINE_HEIGHT);

  useEffect(() => () => detach.current?.(), []);

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) {
    const model = editor.getModel();
    if (model) {
      detach.current = attachCompletion(model, {
        editor: kind,
        context: () => contextRef.current(),
      });
    }

    if (multiline) {
      addEditorCommand(editor, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
        submitRef.current(),
      );
      // Grow with the pipeline; the field stays drag-resizable too.
      const fit = () =>
        setPipelineHeight(
          Math.min(MAX_PIPELINE_HEIGHT, Math.max(MIN_PIPELINE_HEIGHT, editor.getContentHeight())),
        );
      editor.onDidContentSizeChange(fit);
      fit();
      return;
    }
    // One line: Enter runs the query - unless the suggestion list is open,
    // where it accepts the highlighted item as usual.
    addEditorCommand(
      editor,
      monaco.KeyCode.Enter,
      () => submitRef.current(),
      "!suggestWidgetVisible",
    );
    // Pasted multi-line JSON would hide everything past its first line.
    editor.onDidPaste(() => {
      if (!model || model.getLineCount() === 1) return;
      const flat = model.getValue().replace(/\s*\r?\n\s*/g, " ");
      model.setValue(flat);
      editor.setPosition({ lineNumber: 1, column: flat.length + 1 });
    });
  }

  const padding = multiline ? PIPELINE_PADDING : LINE_PADDING;
  const editorElement = (
    <Editor
      language="json"
      // The app themes paint editor.background in the field tone.
      theme={monacoTheme(themeId)}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      options={{
        ariaLabel,
        placeholder,
        fontFamily: FONT_FAMILY,
        fontSize: 12.5,
        fontLigatures: false,
        lineHeight: LINE_HEIGHT,
        padding: { top: padding, bottom: padding },
        minimap: { enabled: false },
        lineNumbers: multiline ? "on" : "off",
        lineNumbersMinChars: multiline ? 2 : 0,
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: multiline ? 10 : 0,
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollBeyondLastLine: false,
        scrollbar: multiline
          ? { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
          : { vertical: "hidden", horizontal: "hidden", alwaysConsumeMouseWheel: false },
        wordWrap: multiline ? "on" : "off",
        automaticLayout: true,
        // the suggestion list must escape this small box instead of being clipped
        fixedOverflowWidgets: true,
        wordBasedSuggestions: "off",
        quickSuggestions: { other: true, strings: true, comments: false },
        tabSize: 2,
      }}
    />
  );

  if (multiline) {
    return (
      <div
        className={cn(
          "relative min-h-16 resize-y overflow-hidden rounded-md border border-field-line bg-field transition-[border-color,box-shadow] duration-100",
          "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          className,
        )}
        style={{ height: pipelineHeight + 2 }}
      >
        <div className="absolute inset-0">{editorElement}</div>
      </div>
    );
  }

  return (
    <QueryField label={label ?? kind} className={className}>
      <div className="h-full min-w-0 flex-1">{editorElement}</div>
      {trailing}
    </QueryField>
  );
}
