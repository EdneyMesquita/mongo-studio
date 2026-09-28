import { Loader2, Plug } from "lucide-react";
import type { ReactNode } from "react";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { cn } from "@/lib/utils";
import { useActiveConnection, useConnectedCount } from "./useActiveConnection";
import { AssistantStatusItem } from "../assistant/AssistantStatusItem";

interface StatusItemProps {
  className?: string;
  children: ReactNode;
}

function StatusItem({ className, children }: StatusItemProps) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

/**
 * The 26px strip at the bottom: which server the active tab runs on and how
 * many are connected; on the right, the tab's namespace and document count.
 */
export function StatusBar() {
  const active = useActiveConnection();
  const connected = useConnectedCount();
  const tab = active?.tab;

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-0.5 overflow-hidden border-t border-seam bg-panel px-2 text-xs text-fg-2">
      {active ? (
        <StatusItem className="min-w-0">
          <ConnectionChip name={active.tab.connection.name} color={active.color} size="dot" />
          <span className="truncate font-medium text-fg">{active.tab.connection.name}</span>
          {active.session?.serverVersion && <span>MongoDB {active.session.serverVersion}</span>}
        </StatusItem>
      ) : (
        connected === 0 && <StatusItem>No connection open</StatusItem>
      )}
      {connected > 0 && (
        <StatusItem>
          <Plug className="size-3" />
          {connected} connected
        </StatusItem>
      )}
      <span className="flex-1" />
      {tab?.kind === "collection" && (
        <>
          <StatusItem className="min-w-0">
            <span className="truncate font-data">
              {tab.database}.{tab.collection}
            </span>
          </StatusItem>
          {tab.loading ? (
            <StatusItem>
              <Loader2 className="size-3 animate-spin" />
              Running
            </StatusItem>
          ) : (
            <>
              {tab.stats && (
                <StatusItem className="tabular-nums">
                  {tab.stats.documentCount.toLocaleString("en")}{" "}
                  {tab.stats.documentCount === 1 ? "document" : "documents"}
                </StatusItem>
              )}
              {tab.queryMs !== null && (
                <StatusItem className="tabular-nums">{tab.queryMs} ms</StatusItem>
              )}
            </>
          )}
        </>
      )}
      {tab?.kind === "console" && <StatusItem>JavaScript</StatusItem>}
      <AssistantStatusItem />
    </footer>
  );
}
