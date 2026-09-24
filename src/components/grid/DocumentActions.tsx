import { useState } from "react";
import { Check, Copy, Pencil } from "lucide-react";
import { useConsoleStore } from "../../store/consoleStore";
import { useSessionsStore } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { buildEditScript } from "../../lib/editScript";

const buttonClass =
  "rounded border border-border-subtle bg-panel-alt p-1 text-text-muted hover:bg-panel-hover hover:text-text-default";

interface DocumentActionsProps {
  doc: unknown;
  collectionName: string;
  /** The tab the document came from, whose console receives the edit. */
  tabId: string;
}

/** Copy-as-JSON and edit-in-console, shared by the card and table views. */
export function DocumentActions({ doc, collectionName, tabId }: DocumentActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard access denied - nothing more we can do here
    }
  }

  function handleEdit() {
    if (!doc || typeof doc !== "object") return;
    const script = buildEditScript(doc as Record<string, unknown>, collectionName);
    useConsoleStore.getState().setScript(tabId, script);
    useSessionsStore.getState().activateTab(tabId);
    useUiStore.getState().setMainTab("console");
  }

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={handleCopy}
        title="Copy document as JSON"
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={handleEdit}
        title="Edit in console"
      >
        <Pencil size={13} />
      </button>
    </>
  );
}
