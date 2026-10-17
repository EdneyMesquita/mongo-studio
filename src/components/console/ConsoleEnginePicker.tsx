import { useEffect } from "react";
import { Check, ChevronDown, Settings, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMongoshStore } from "../../store/mongoshStore";
import { useSettingsStore, useTabEngine, type ScriptEngine } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";

/** The "sh" mark that tells a mongosh console at a glance. */
function MongoshMark() {
  return <span className="rounded-[3px] bg-ok/14 px-[3px] py-0.5 font-mono text-[10px] leading-none font-semibold text-ok">sh</span>;
}

/** Which engine runs this console, and a menu to switch it for this console alone. */
export function ConsoleEnginePicker({ tabId }: { tabId: string }) {
  const engine = useTabEngine(tabId);
  const setTabEngine = useSettingsStore((s) => s.setTabEngine);
  const info = useMongoshStore((s) => s.info);
  const detect = useMongoshStore((s) => s.detect);
  const found = Boolean(info?.path) && !info?.error;
  const mongoshName = `mongosh${info?.version ? ` ${info.version}` : ""}`;

  useEffect(() => {
    if (useMongoshStore.getState().info === null) void detect();
  }, [detect]);

  const pick = (e: ScriptEngine) => setTabEngine(tabId, e);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" title="Script engine" className="@max-[700px]:px-1.5">
          {engine === "mongosh" ? <MongoshMark /> : <SquareTerminal />}
          <span className="@max-[700px]:hidden">{engine === "mongosh" ? mongoshName : "Built-in"}</span>
          <ChevronDown className="size-3 text-fg-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Run this console with</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => pick("builtin")}>
          {engine === "builtin" ? <Check /> : <span className="size-4" />}
          Built-in
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!found} onSelect={() => pick("mongosh")}>
          {engine === "mongosh" ? <Check /> : <span className="size-4" />}
          {found ? mongoshName : "mongosh (not found)"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => useUiStore.getState().setSettingsSection("console")}>
          <Settings />
          {found ? "Console settings…" : "Get mongosh…"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
