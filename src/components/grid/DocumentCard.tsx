import { useState } from "react";
import { Check, Copy, Pencil } from "lucide-react";
import { useConsoleStore } from "../../store/consoleStore";
import { useUiStore } from "../../store/uiStore";
import { buildEditScript } from "../../lib/editScript";

interface DocumentCardProps {
  doc: unknown;
  collectionName: string;
}

export function DocumentCard({ doc, collectionName }: DocumentCardProps) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(doc, null, 2);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access denied - nothing more we can do here
    }
  }

  function handleEdit() {
    if (!doc || typeof doc !== "object") return;
    const script = buildEditScript(doc as Record<string, unknown>, collectionName);
    useConsoleStore.getState().setScript(script);
    useUiStore.getState().setMainTab("console");
  }

  return (
    <div className="group relative rounded border border-border-subtle bg-panel">
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded border border-border-subtle bg-panel-alt p-1 text-text-muted hover:bg-panel-hover hover:text-text-default"
          onClick={handleCopy}
          title="Copy document as JSON"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className="rounded border border-border-subtle bg-panel-alt p-1 text-text-muted hover:bg-panel-hover hover:text-text-default"
          onClick={handleEdit}
          title="Edit in console"
        >
          <Pencil size={13} />
        </button>
      </div>
      <pre className="overflow-x-auto p-2 pr-16 text-xs text-text-default">{json}</pre>
    </div>
  );
}
