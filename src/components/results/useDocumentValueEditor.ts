import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/tauri";
import { documentKey } from "../../lib/bsonFormat";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { CollectionTab } from "../../store/sessionsStore";
import type { SavedValue, ValueEditor } from "../json/ValueEditContext";

/** How long a saved value flashes (the animate-flash animation). */
const FLASH_MS = 1200;

/**
 * Writes in-place edits of a tab's results back with updateField, then puts
 * the updated document in the results, toasts, and flashes the value.
 * Values are editable only in find results; see CollectionTab.resultsMode.
 */
export function useDocumentValueEditor(tab: CollectionTab): ValueEditor | null {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);
  const replaceDocument = useSessionsStore((s) => s.replaceDocument);
  const [saved, setSaved] = useState<SavedValue | null>(null);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const { id: tabId, database, collection, resultsMode } = tab;
  return useMemo<ValueEditor | null>(() => {
    if (!session || resultsMode !== "find") return null;
    return {
      saved,
      commit: async (doc, path, value) => {
        const id = (doc as { _id?: unknown } | null)?._id;
        if (id === undefined) throw new Error("This document has no _id to update it by");
        const updated = await api.updateField(
          session.sessionId,
          database,
          collection,
          id,
          path,
          value,
        );
        replaceDocument(tabId, updated);
        const field = path.join(".");
        setSaved({ docKey: documentKey(updated) ?? "", path: field, at: Date.now() });
        toast.success(`${field} updated`, {
          description: `updateOne on ${database}.${collection} · 1 document modified`,
        });
      },
    };
  }, [session, resultsMode, saved, database, collection, tabId, replaceDocument]);
}
