import { useId } from "react";
import { RefreshCw, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { Switch } from "@/components/ui/switch";
import { connectionColor } from "@/lib/connectionColor";
import { cn } from "@/lib/utils";
import {
  AGENT_NAMES,
  AGENT_PROVIDERS,
  defaultAccess,
  useAssistantStore,
} from "../../store/assistantStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import type { AgentKind } from "../../types/assistant";

function SectionTitle({ children }: { children: string }) {
  return <div className="-mb-1 mt-1.5 text-sm font-semibold text-fg-2">{children}</div>;
}

interface ShareSwitchProps {
  title: string;
  help: string;
  checked: boolean;
  onChange?: (on: boolean) => void;
}

function ShareSwitch({ title, help, checked, onChange }: ShareSwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <Switch id={id} checked={checked} disabled={!onChange} onCheckedChange={onChange} className="mt-px disabled:opacity-60" />
      <label htmlFor={id} className={cn("text-base", onChange && "cursor-pointer")}>
        <b className="block font-medium">{title}</b>
        <span className="mt-px block text-sm leading-[1.45] text-fg-3">{help}</span>
      </label>
    </div>
  );
}

/**
 * First run, and the settings after it: which agent, what it may read,
 * which connections, and plainly where what it reads goes. The Assistant
 * stays off until the user starts it here.
 */
export function AssistantSetup() {
  const enabled = useAssistantStore((s) => s.enabled);
  const agent = useAssistantStore((s) => s.agent);
  const agents = useAssistantStore((s) => s.agents);
  const detecting = useAssistantStore((s) => s.detecting);
  const share = useAssistantStore((s) => s.share);
  const access = useAssistantStore((s) => s.access);
  const { detect, setAgent, setShare, setAccess, enable, closePanel, openPanel } = useAssistantStore.getState();
  const profiles = useConnectionsStore((s) => s.profiles);
  const chosen = agents?.find((a) => a.id === agent);
  const name = AGENT_NAMES[agent];

  return (
    <>
      <div className="flex h-9 flex-none items-center pr-1.5 pl-3">
        <h2 className="m-0 flex-1 text-base font-semibold">{enabled ? "Assistant settings" : "Set up the Assistant"}</h2>
        <Button variant="ghost" size="icon" title="Close" aria-label="Close" onClick={closePanel}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto border-t border-line-soft px-3.5 pt-3.5 pb-[18px]">
        <p className="m-0 text-sm leading-normal text-fg-2">
          The Assistant runs on an AI coding agent already installed on this computer, signed in with your own account.
          Mongo Studio has no AI service of its own and never sees an API key.
        </p>
        <div className="flex items-start gap-2 rounded-md bg-fg/5 p-2.5 text-sm leading-normal text-fg-2">
          <Shield className="mt-0.5 size-3.5 shrink-0" />
          <div>
            Your messages, and whatever the agent reads, are sent to{" "}
            <b className="font-medium text-fg">{AGENT_PROVIDERS[agent]}</b> under your {name} account's terms. Nothing
            else leaves this machine.
          </div>
        </div>

        <SectionTitle>Agent</SectionTitle>
        <div role="radiogroup" aria-label="Agent" className="flex flex-col gap-1.5">
          {(["claude", "codex"] as AgentKind[]).map((id) => {
            const found = agents?.find((a) => a.id === id);
            const missing = agents !== null && !found?.path;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={agent === id}
                disabled={missing}
                onClick={() => setAgent(id)}
                className={cn(
                  "grid w-full grid-cols-[14px_1fr_auto] items-center gap-x-2.5 gap-y-[3px] rounded-md border border-line bg-editor px-2.5 py-[9px] text-left hover:border-field-line disabled:cursor-default disabled:opacity-70 disabled:hover:border-line",
                  agent === id && "border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-editor))] hover:border-accent",
                )}
              >
                <span
                  className={cn(
                    "size-3.5 rounded-full border border-field-line bg-field",
                    agent === id && "border-4 border-accent bg-white",
                  )}
                />
                <span className="font-medium">{AGENT_NAMES[id]}</span>
                <span className="font-mono text-xs text-fg-3">{found?.version ?? ""}</span>
                <span className="col-start-2 col-end-4 font-mono text-[11px] leading-[1.4] text-fg-3 [font-variant-ligatures:none]">
                  {found?.path ?? (agents === null ? "Looking…" : `${id} is not on this computer`)}
                </span>
                <span className="col-start-2 col-end-4 inline-flex items-center gap-[5px] text-xs text-fg-2">
                  {found?.path ? (
                    <>
                      <span className="size-1.5 rounded-full bg-ok" />
                      Found · uses your {AGENT_NAMES[id]} sign-in
                    </>
                  ) : missing ? (
                    found?.error ?? `Install ${AGENT_NAMES[id]} and sign in once in a terminal, then Rescan`
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-3">
          {detecting ? "Looking on your PATH…" : "Looked for claude and codex on your PATH"}
          <Button size="sm" variant="ghost" className="ml-auto" disabled={detecting} onClick={() => void detect()}>
            <RefreshCw className={cn(detecting && "animate-spin")} />
            Rescan
          </Button>
        </div>

        <SectionTitle>What it can read</SectionTitle>
        <ShareSwitch
          title="Collections, fields and types"
          help="Always on: it can't write a query without them. Learned by sampling up to 200 documents; only names and types are sent."
          checked
        />
        <ShareSwitch
          title="Indexes and explain plans"
          help="So it can tell why a query is slow and which index serves it."
          checked={share.indexes}
          onChange={(on) => setShare("indexes", on)}
        />
        <ShareSwitch
          title="Document values"
          help={share.values ? "It may read documents it needs, capped at 50 per call." : "Off: it asks you before reading any document, every time."}
          checked={share.values}
          onChange={(on) => setShare("values", on)}
        />

        <SectionTitle>Connections it may read</SectionTitle>
        <div role="group" aria-label="Connections the Assistant may read" className="-mx-1.5 flex flex-col">
          {profiles.map((p) => {
            const allowed = access[p.id] ?? defaultAccess(p.summary);
            const id = `assistant-access-${p.id}`;
            return (
              <label key={p.id} htmlFor={id} className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-1.5 hover:bg-hover">
                <Checkbox id={id} checked={allowed} onCheckedChange={(on) => setAccess(p.id, on === true)} />
                <ConnectionChip name={p.name} color={connectionColor(p.id, p.color)} size="sm" />
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="ml-auto text-xs text-fg-3">{defaultAccess(p.summary) ? "This computer" : "Remote"}</span>
              </label>
            );
          })}
        </div>
        <p className="m-0 text-sm leading-normal text-fg-2">
          Connections on this machine (localhost) start allowed; remote ones stay unchecked until you allow them here.
          Connection strings and passwords never reach the agent.
        </p>

        <SectionTitle>How it stays read-only</SectionTitle>
        <p className="m-0 text-sm leading-normal text-fg-2">
          {name} is started with only Mongo Studio's tools: list, sample, find and aggregate with a limit, explain. Its
          own shell and file tools are turned off and <span className="font-mono text-xs">$out</span> and{" "}
          <span className="font-mono text-xs">$merge</span> are refused. Scripts it writes open in a console and run only
          when you press Run.
        </p>
      </div>
      <div className="flex flex-none items-center justify-end gap-2 border-t border-line px-3 py-2.5">
        {enabled ? (
          <Button variant="primary" onClick={() => openPanel("chat")}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={closePanel}>
              Not now
            </Button>
            <Button variant="primary" disabled={!chosen?.path} onClick={enable}>
              Start with {name}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
