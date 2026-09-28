import { ArrowUp, AtSign, Braces, Funnel, Square, SquareTerminal, Table2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAssistantStore } from "../../store/assistantStore";
import type { AssistantSession, ContextItem } from "../../store/assistantStore";
import { useConsoleStore } from "../../store/consoleStore";
import { databaseKey, selectActiveTab, useSessionsStore } from "../../store/sessionsStore";
import { selectedDocumentOf } from "../results/useDocumentSelection";
import { AgentPicker } from "./AgentPicker";
import { AttachedChip } from "./ContextChips";

/** Attached values are capped; the agent can read more through its tools. */
const MAX_ATTACHED = 8000;

const json = (value: unknown) => {
  const text = JSON.stringify(value, null, 2) ?? "undefined";
  return text.length > MAX_ATTACHED ? `${text.slice(0, MAX_ATTACHED)}\n… (truncated)` : text;
};

/** What "Add context" can attach right now, from the tab in view. */
function contextSources(session: AssistantSession) {
  const tab = selectActiveTab(useSessionsStore.getState());
  const sources: Omit<ContextItem, "id">[] = [];
  if (tab?.kind === "collection") {
    const aggregate = tab.mode === "aggregate";
    sources.push({
      kind: "filter",
      label: `${aggregate ? "pipeline" : "filter"} on ${tab.collection}`,
      content: aggregate ? tab.pipelineText : tab.filterText,
    });
    const doc = tab.results ? selectedDocumentOf(tab.id, tab.results.documents) : undefined;
    if (doc !== undefined) sources.push({ kind: "document", label: `document from ${tab.collection}`, content: json(doc) });
  }
  const consoleSession = tab ? useConsoleStore.getState().consoles[tab.id] : undefined;
  if (consoleSession?.hasResult) {
    sources.push({ kind: "result", label: "console result", content: json(consoleSession.result) });
  }
  const collections =
    useSessionsStore.getState().databaseTree[databaseKey(session.connectionId, session.database)]?.collections ?? [];
  return { sources, collections: collections.map((c) => c.name).filter((n) => n !== session.collection) };
}

/** The message box: attached context, the agent, send or stop. */
export function Composer({ session }: { session: AssistantSession }) {
  const draft = useAssistantStore((s) => s.draft);
  const context = useAssistantStore((s) => s.context);
  const setDraft = useAssistantStore((s) => s.setDraft);
  const addContext = useAssistantStore((s) => s.addContext);
  const removeContext = useAssistantStore((s) => s.removeContext);
  const send = useAssistantStore((s) => s.send);
  const stop = useAssistantStore((s) => s.stop);
  const where = session.collection ? `${session.database}.${session.collection}` : session.database;
  const focusInput = () => document.getElementById("assistant-input")?.focus();

  return (
    <div className="mx-2 mb-2 flex-none rounded-lg border border-field-line bg-field transition-[border-color,box-shadow] duration-100 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
      <textarea
        id="assistant-input"
        rows={2}
        value={draft}
        placeholder={`Ask about ${where}, or describe a query or script`}
        aria-label="Message the Assistant"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        className="block h-[58px] w-full resize-none bg-transparent px-2.5 pt-2 pb-0.5 leading-[1.45] text-fg outline-none placeholder:text-fg-3"
      />
      <div className="flex items-center gap-1 py-1 pr-1 pl-1.5">
        {session.collection && (
          <span
            className="inline-flex h-[22px] items-center gap-[5px] rounded-sm bg-fg/7 px-[7px] text-xs text-fg-2"
            title="The session reads this collection first"
          >
            <Table2 className="size-3" />
            <span className="font-mono text-[11px] text-fg">{session.collection}</span>
          </span>
        )}
        {context.map((c) => (
          <AttachedChip key={c.id} item={c} onRemove={() => removeContext(c.id)} />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Add context"
              className="inline-flex h-[22px] items-center gap-[5px] rounded-sm px-[5px] text-xs whitespace-nowrap text-fg-3 hover:bg-hover hover:text-fg aria-expanded:bg-hover"
            >
              <AtSign className="size-3" />
              Add context
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56" onCloseAutoFocus={(e) => { e.preventDefault(); focusInput(); }}>
            <ContextSourceItems session={session} onAdd={addContext} />
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="flex-1" />
        <AgentPicker />
        {session.running ? (
          <button
            type="button"
            onClick={() => void stop()}
            title="Stop"
            aria-label="Stop"
            className="grid size-[26px] place-items-center rounded-md bg-fg/10 text-fg hover:bg-hover"
          >
            <Square className="size-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim()}
            title="Send (Enter)"
            aria-label="Send"
            className={cn(
              "grid size-[26px] place-items-center rounded-md bg-primary text-primary-foreground hover:bg-accent-hover",
              "disabled:cursor-default disabled:bg-fg/10 disabled:text-fg-3",
            )}
          >
            <ArrowUp className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Built when the menu opens, so it offers what's in view at that moment. */
function ContextSourceItems({ session, onAdd }: { session: AssistantSession; onAdd: (item: Omit<ContextItem, "id">) => void }) {
  const menu = contextSources(session);
  const addContext = onAdd;
  return (
    <>
            <DropdownMenuLabel>Add to the next message</DropdownMenuLabel>
            {menu.sources.map((source) => (
              <DropdownMenuItem key={source.label} onSelect={() => addContext(source)}>
                {source.kind === "filter" ? <Funnel className="size-3.5" /> : source.kind === "document" ? <Braces className="size-3.5" /> : <SquareTerminal className="size-3.5" />}
                {source.kind === "filter" ? `Current ${source.label.split(" ")[0]}` : source.kind === "document" ? "Selected document" : "Console result"}
              </DropdownMenuItem>
            ))}
            {menu.collections.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Table2 className="size-3.5" />
                  Another collection
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {menu.collections.map((name) => (
                    <DropdownMenuItem
                      key={name}
                      onSelect={() =>
                        addContext({ kind: "collection", label: name, content: `Also consider the collection "${name}" in ${session.database}.` })
                      }
                    >
                      <span className="font-data">{name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {menu.sources.length === 0 && menu.collections.length === 0 && (
              <DropdownMenuItem disabled>Nothing to attach from this tab</DropdownMenuItem>
            )}
    </>
  );
}
