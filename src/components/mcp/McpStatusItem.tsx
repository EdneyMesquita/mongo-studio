import { Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMcpStore } from "../../store/mcpStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";

/** The status bar's note of the MCP server: its clients, or a request waiting. */
export function McpStatusItem() {
  const enabled = useSettingsStore((s) => s.mcp.enabled);
  const status = useMcpStore((s) => s.status);
  const waiting = useMcpStore((s) => s.requests.length);
  if (!enabled) return null;
  const clients = status?.clients.length ?? 0;
  const note =
    waiting > 0 ? `${waiting} request${waiting === 1 ? "" : "s"} waiting`
    : status?.error ? "not running"
    : `${clients} client${clients === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      onClick={() => useUiStore.getState().setSettingsSection("mcp")}
      title={status?.error ?? "MCP server"}
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-[7px] whitespace-nowrap hover:bg-hover hover:text-fg",
        (waiting > 0 || status?.error) && "text-warn hover:text-warn",
      )}
    >
      <Server className="size-3" />
      <span>MCP</span>
      <span className={cn(!(waiting > 0 || status?.error) && "text-fg-3")}>{note}</span>
    </button>
  );
}
