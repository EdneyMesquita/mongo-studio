import { Play, Sparkles, Square } from "lucide-react";
import { useAssistantStore } from "../../store/assistantStore";
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
import { InlineAskStrip } from "../assistant/InlineAskStrip";
import { ProposedFilter } from "../assistant/ProposedFilter";
import { useAssistantFlash } from "../assistant/useAssistantFlash";

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
  const cancelQuery = useSessionsStore((s) => s.cancelQuery);
  const ask = useAssistantStore((s) => (s.inline[tab.id]?.kind === "filter" ? s.inline[tab.id] : undefined));
  const askInline = useAssistantStore((s) => s.askInline);
  const flash = useAssistantFlash(tab.id);

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

  const reviewing = !aggregate && ask?.state === "review" && ask.proposal !== null;
  // While a proposal waits for Accept or Reject it is the bar's one primary.
  const pending = !aggregate && ask !== undefined;

  return (
    <>
    {/* A container, so a narrow editor (the Assistant open) gives the filter its
        own row, and a narrower pane of a split two rows: mode, filter and Run,
        then sort, limit and skip. */}
    <div className={cn("@container flex-none px-2.5 py-2", pending ? "pb-1.5" : "border-b border-line")}>
    <div
      className={cn(
        "flex flex-wrap gap-2 @max-[620px]:grid @max-[620px]:grid-cols-[auto_minmax(0,1fr)_auto]",
        aggregate || reviewing ? "items-start" : "items-center",
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
          className={cn(
            "min-w-[200px] flex-1 max-sm:order-first max-sm:basis-full",
            flash === "pipeline" && "animate-flash-box",
          )}
        />
      ) : (
        <>
          {reviewing ? (
            <ProposedFilter original={ask.original} proposal={ask.proposal!} />
          ) : (
            <QueryEditor
              kind="filter"
              label="filter"
              ariaLabel="Filter"
              value={filterText}
              onChange={(text) => updateTab(tab.id, { filterText: text })}
              completionContext={completionContext}
              onSubmit={submit}
              placeholder='{ "field": "value" }'
              className={cn(
                "min-w-[200px] flex-1 max-sm:order-first max-sm:basis-full @max-[820px]:order-first @max-[820px]:basis-full",
                "@max-[620px]:order-none @max-[620px]:min-w-0",
                flash === "filter" && "animate-flash-box",
              )}
              trailing={
                <button
                  type="button"
                  onClick={askInline}
                  title="Ask the Assistant (Ctrl I)"
                  aria-label="Ask the Assistant for a filter"
                  className="mr-[3px] grid size-6 shrink-0 place-items-center rounded-sm text-fg-3 hover:bg-hover hover:text-accent-text"
                >
                  <Sparkles className="size-3.5" />
                </button>
              }
            />
          )}
          {/* One row of their own in a narrow pane; part of the bar's flow otherwise. */}
          <div className="contents @max-[620px]:order-last @max-[620px]:col-span-3 @max-[620px]:flex @max-[620px]:gap-2">
          <QueryEditor
            kind="sort"
            label="sort"
            ariaLabel="Sort"
            value={sortText}
            onChange={(text) => updateTab(tab.id, { sortText: text })}
            completionContext={completionContext}
            onSubmit={submit}
            placeholder='{ "_id": -1 }'
            className="min-w-[120px] flex-[0_1_190px] max-[960px]:basis-[130px] max-sm:flex-1 @max-[620px]:min-w-0 @max-[620px]:flex-1"
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
          </div>
        </>
      )}
      <div className={cn("flex flex-col items-start gap-1.5", aggregate && "mt-px")}>
        {loading ? (
          <Button title="Stop the running query" onClick={() => cancelQuery(tab.id)}>
            <Square />
            Cancel
          </Button>
        ) : (
          <Button
            variant={pending ? "secondary" : "primary"}
            disabled={pending}
            title={pending ? "Accept or reject the proposal first" : undefined}
            onClick={submit}
          >
            <Play />
            Run
            <Kbd>{aggregate ? "Ctrl ⏎" : "⏎"}</Kbd>
          </Button>
        )}
        {aggregate && tab.assistantSource === "pipeline" && <FromAssistantTag />}
      </div>
    </div>
    </div>
    {ask && !aggregate && <InlineAskStrip tab={tab} ask={ask} />}
    </>
  );
}

/** Marks a query or script the Assistant wrote, until the user edits it. */
export function FromAssistantTag() {
  return (
    <span
      title="Written by the Assistant"
      className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-sm bg-accent/12 px-1.5 text-xs font-medium whitespace-nowrap text-accent-text"
    >
      <Sparkles className="size-3" />
      from Assistant
    </span>
  );
}
