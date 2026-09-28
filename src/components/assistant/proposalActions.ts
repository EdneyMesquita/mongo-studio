import { toast } from "sonner";
import { useAssistantStore } from "../../store/assistantStore";
import type { AssistantSession } from "../../store/assistantStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useConsoleStore } from "../../store/consoleStore";
import { tabIdFor, useSessionsStore } from "../../store/sessionsStore";
import type { CollectionTab, TabConnection } from "../../store/sessionsStore";
import { useUiStore } from "../../store/uiStore";
import { compactJson } from "../../lib/assistant/format";
import type { Proposal } from "../../lib/assistant/answer";

/** The connection as a tab shows it, from its saved profile. */
function tabConnection(session: AssistantSession): TabConnection {
  const profile = useConnectionsStore.getState().profiles.find((p) => p.id === session.connectionId);
  return { id: session.connectionId, name: session.connectionName, summary: profile?.summary ?? "" };
}

/** The collection a filter or pipeline goes into. */
export function proposalCollection(session: AssistantSession, proposal: Proposal): string | null {
  return proposal.collection ?? session.collection;
}

/**
 * Puts a filter or a pipeline into its collection's tab - opening the tab if
 * needed - and runs it. The tab's previous query is kept for Undo.
 */
export async function applyToQuery(session: AssistantSession, cardId: string, proposal: Proposal) {
  const collection = proposalCollection(session, proposal);
  const live = useConnectionsStore.getState().sessions[session.connectionId];
  if (!collection || !live) {
    toast.error(live ? "The proposal doesn't name its collection" : `${session.connectionName} is not connected`);
    return;
  }
  const sessions = useSessionsStore.getState();
  const id = tabIdFor(session.connectionId, session.database, collection);
  if (!sessions.tabs.some((t) => t.id === id)) {
    await sessions.openCollection(live.sessionId, tabConnection(session), session.database, collection);
  } else sessions.activateTab(id);
  const tab = useSessionsStore.getState().tabs.find((t) => t.id === id) as CollectionTab | undefined;
  if (!tab) return;
  useUiStore.getState().setMainTab("browse");
  useAssistantStore.getState().markApplied(cardId, {
    kind: "query",
    tabId: id,
    previous: { mode: tab.mode, filterText: tab.filterText, pipelineText: tab.pipelineText },
  });
  const field = proposal.kind === "pipeline" ? "pipeline" : "filter";
  useSessionsStore
    .getState()
    .applyQuery(
      id,
      field === "pipeline"
        ? { mode: "aggregate", pipelineText: proposal.code }
        : { mode: "find", filterText: compactJson(proposal.code) },
      field,
    );
  useAssistantStore.setState({ flash: { tabId: id, field, at: Date.now() } });
  await useSessionsStore.getState().runQuery(live.sessionId, id);
}

/** Puts the tab's query back the way it was before the proposal. */
export async function undoApplied(session: AssistantSession, cardId: string) {
  const applied = session.applied[cardId];
  if (applied?.kind !== "query") return;
  useAssistantStore.getState().unmarkApplied(cardId);
  const sessions = useSessionsStore.getState();
  if (!sessions.tabs.some((t) => t.id === applied.tabId)) return;
  useSessionsStore.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === applied.tabId && t.kind === "collection" ? { ...t, ...applied.previous, assistantSource: null } : t,
    ),
  }));
  sessions.activateTab(applied.tabId);
  const live = useConnectionsStore.getState().sessions[session.connectionId];
  if (live) await useSessionsStore.getState().runQuery(live.sessionId, applied.tabId);
}

/** The console script a proposal becomes: scripts as they are, queries wrapped. */
export function consoleScriptFor(session: AssistantSession, proposal: Proposal): string {
  if (proposal.kind === "script") return proposal.code.replace(/\s+$/, "") + "\n";
  const collection = JSON.stringify(proposalCollection(session, proposal) ?? "collection");
  if (proposal.kind === "pipeline") {
    return `// Written by the Assistant\nconst rows = await db.collection(${collection}).aggregate(${proposal.code});\nrows;\n`;
  }
  return `// Written by the Assistant\nconst docs = await db.collection(${collection}).find(${compactJson(proposal.code)}, { limit: 50 });\ndocs;\n`;
}

/** Opens a new console on the session's database with the proposal in it, not run. */
export function openInConsole(session: AssistantSession, cardId: string, proposal: Proposal) {
  const id = useSessionsStore
    .getState()
    .openConsole(tabConnection(session), session.database, proposalCollection(session, proposal), {
      fromAssistant: true,
    });
  useConsoleStore.getState().setScript(id, consoleScriptFor(session, proposal));
  if (proposal.kind === "script") useAssistantStore.getState().markApplied(cardId, { kind: "console", tabId: id });
}

export function copyProposal(proposal: Proposal) {
  const what = proposal.kind === "script" ? "script" : proposal.kind;
  navigator.clipboard.writeText(proposal.code).then(
    () => toast.success(`Copied the ${what}`, { description: "Paste it anywhere; nothing ran" }),
    (e) => toast.error(`Couldn't copy the ${what}`, { description: String(e) }),
  );
}
