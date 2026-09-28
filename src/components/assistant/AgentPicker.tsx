import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGENT_NAMES, selectCurrentSession, useAssistantStore } from "../../store/assistantStore";
import type { AgentKind } from "../../types/assistant";

/** Which CLI answers the next message. */
export function AgentPicker() {
  const agent = useAssistantStore((s) => s.agent);
  const agents = useAssistantStore((s) => s.agents);
  const setAgent = useAssistantStore((s) => s.setAgent);
  const openPanel = useAssistantStore((s) => s.openPanel);
  const detect = useAssistantStore((s) => s.detect);
  const version = agents?.find((a) => a.id === agent)?.version;

  function choose(next: AgentKind) {
    if (next === agent) return;
    setAgent(next);
    const session = selectCurrentSession(useAssistantStore.getState());
    if (session?.messages.length) {
      toast(`Next messages go to ${AGENT_NAMES[next]}`, { description: "It gets this session's transcript as context" });
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && !agents && void detect()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={version ? `${AGENT_NAMES[agent]} ${version}` : AGENT_NAMES[agent]}
          className="inline-flex h-6 items-center gap-[5px] rounded-md px-1.5 text-sm text-fg-2 hover:bg-hover hover:text-fg aria-expanded:bg-hover"
        >
          {AGENT_NAMES[agent]}
          <ChevronDown className="size-3 text-fg-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-56">
        <DropdownMenuLabel>Agent on this machine</DropdownMenuLabel>
        {(["claude", "codex"] as const).map((id) => {
          const found = agents?.find((a) => a.id === id);
          return (
            <DropdownMenuItem key={id} disabled={agents !== null && !found?.path} onSelect={() => choose(id)}>
              {agent === id ? <Check className="size-3.5" /> : <span className="w-3.5" />}
              <span className="flex-1">{AGENT_NAMES[id]}</span>
              <span className="font-mono text-xs text-fg-3">{found?.version ?? (agents && !found?.path ? "not found" : "")}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openPanel("setup")}>
          <SlidersHorizontal className="size-3.5" />
          Assistant settings…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
