import { Bot, Layers, Link2, Plus } from "lucide-react";
import { useRelationsStore, openRelationTab, startRelation } from "../../store/relationsStore";
import { selectActiveTab, TabKind, useSessionsStore } from "../../store/sessionsStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelHeader } from "../sidebar/PanelHeader";
import type { Relation } from "../../types/relations";

/** Starts a relation from the collection in view, or from the first live connection. */
export function newRelationFromContext() {
  const tab = selectActiveTab(useSessionsStore.getState());
  if (tab?.kind === TabKind.Collection) {
    startRelation(tab.connection, tab.database, tab.collection);
    return;
  }
  const { profiles, sessions } = useConnectionsStore.getState();
  const live = tab?.connection ?? profiles.find((p) => sessions[p.id]) ?? profiles[0];
  if (!live) return;
  startRelation({ id: live.id, name: live.name, summary: live.summary }, tab?.database ?? "", "");
}

/** The Relations tool window: saved relations by their From database, drafts flagged. */
export function RelationsPanel() {
  const relations = useRelationsStore((s) => s.relations);
  const loaded = useRelationsStore((s) => s.loaded);
  const current = useSessionsStore((s) => {
    const tab = selectActiveTab(s);
    return tab?.kind === TabKind.Relation ? tab.relationId : null;
  });
  const groups = new Map<string, Relation[]>();
  for (const r of relations) groups.set(r.from.db, [...(groups.get(r.from.db) ?? []), r]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <PanelHeader title="Relations">
        <Button variant="ghost" size="icon" title="New relation" aria-label="New relation" onClick={newRelationFromContext}>
          <Plus className="size-3.5" />
        </Button>
      </PanelHeader>
      {!loaded && <p className="px-3 py-1.5 text-sm text-fg-3">Loading relations…</p>}
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {[...groups].map(([db, rs]) => (
          <div key={db} role="list" aria-label={db}>
            <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-[.04em] text-fg-3">
              <Layers className="size-3" aria-hidden />
              {db}
            </div>
            {rs.map((r) => (
              <div role="listitem" key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === current || undefined}
                  className={cn(
                    "grid w-full grid-cols-[16px_minmax(0,1fr)] gap-x-2 px-3 py-1.5 text-left outline-none hover:bg-row-hover focus-visible:bg-row-hover",
                    r.id === current && "bg-sel hover:bg-sel",
                  )}
                  onClick={() => openRelationTab(r.id)}
                >
                  <Link2 className="mt-0.5 size-3.5 text-fg-3" aria-hidden />
                  <span className="truncate text-base text-fg">
                    {r.name || "Unnamed relation"}
                    {r.draft && (
                      <span
                        title={`Proposed by ${r.draft.by}`}
                        className="ml-1.5 inline-flex items-center gap-[3px] rounded-lg bg-warn/14 px-1.5 py-px align-[1px] text-[10px] font-semibold text-warn"
                      >
                        <Bot className="size-2.5" aria-hidden />
                        draft
                      </span>
                    )}
                  </span>
                  <span className="col-start-2 truncate font-data text-[10.5px] text-fg-3">
                    {r.from.coll} → {r.to.coll}
                  </span>
                </button>
              </div>
            ))}
          </div>
        ))}
        <p className="px-3 py-2.5 text-sm leading-normal text-fg-3">
          {relations.length === 0 && loaded ? "No relations yet. " : ""}Relations link documents across databases and
          connections. Their results show in a document's Related section and as Related columns.
        </p>
      </div>
    </div>
  );
}
