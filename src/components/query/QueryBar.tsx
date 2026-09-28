import { Play } from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import type { CollectionTab, QueryMode } from "../../store/sessionsStore";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { SegmentOption } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { QueryEditor } from "./QueryEditor";
import { QueryNumberField } from "./QueryNumberField";

const modes: SegmentOption<QueryMode>[] = [
  { value: "find", label: "Find" },
  { value: "aggregate", label: "Aggregate" },
];

/**
 * The collection tab's query: Find (filter, sort, limit, skip) or an
 * Aggregate pipeline, and the bar's one primary action, Run.
 */
export function QueryBar({ tab }: { tab: CollectionTab }) {
  const session = useConnectionsStore((s) => s.sessions[tab.connection.id]);
  const updateTab = useSessionsStore((s) => s.updateTab);
  const runQuery = useSessionsStore((s) => s.runQuery);

  if (!session) return null;

  const { mode, filterText, sortText, limit, skip, pipelineText, loading } = tab;
  const aggregate = mode === "aggregate";
  const submit = () => runQuery(session.sessionId, tab.id);
  // Completion names come from this tab's collection.
  const completionContext = () => ({
    sessionId: session.sessionId,
    database: tab.database,
    collection: tab.collection,
  });

  return (
    <div
      className={cn(
        "flex flex-none flex-wrap gap-2 border-b border-line px-2.5 py-2",
        aggregate ? "items-start" : "items-center",
      )}
    >
      <SegmentedControl
        aria-label="Query mode"
        value={mode}
        onChange={(next) => updateTab(tab.id, { mode: next })}
        options={modes}
        className={aggregate ? "mt-px" : undefined}
      />
      {aggregate ? (
        <QueryEditor
          kind="pipeline"
          ariaLabel="Pipeline"
          multiline
          value={pipelineText}
          onChange={(text) => updateTab(tab.id, { pipelineText: text })}
          completionContext={completionContext}
          onSubmit={submit}
          placeholder='[ { "$match": {} }, { "$limit": 50 } ]'
          className="min-w-[200px] flex-1 max-sm:order-first max-sm:basis-full"
        />
      ) : (
        <>
          <QueryEditor
            kind="filter"
            label="filter"
            ariaLabel="Filter"
            value={filterText}
            onChange={(text) => updateTab(tab.id, { filterText: text })}
            completionContext={completionContext}
            onSubmit={submit}
            placeholder='{ "field": "value" }'
            className="min-w-[200px] flex-1 max-sm:order-first max-sm:basis-full"
          />
          <QueryEditor
            kind="sort"
            label="sort"
            ariaLabel="Sort"
            value={sortText}
            onChange={(text) => updateTab(tab.id, { sortText: text })}
            completionContext={completionContext}
            onSubmit={submit}
            placeholder='{ "_id": -1 }'
            className="min-w-[120px] flex-[0_1_190px] max-[960px]:basis-[130px] max-sm:flex-1"
          />
          <QueryNumberField
            label="limit"
            value={limit}
            onChange={(value) => updateTab(tab.id, { limit: value })}
          />
          <QueryNumberField
            label="skip"
            value={skip}
            onChange={(value) => updateTab(tab.id, { skip: value })}
          />
        </>
      )}
      <Button
        variant="primary"
        disabled={loading}
        onClick={submit}
        className={aggregate ? "mt-px" : undefined}
      >
        <Play />
        Run
        <Kbd>{aggregate ? "Ctrl ⏎" : "⏎"}</Kbd>
      </Button>
    </div>
  );
}
