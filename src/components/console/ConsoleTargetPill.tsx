import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { useConnectionColor } from "@/lib/connectionColor";
import type { Tab } from "../../store/sessionsStore";

/** Where Run goes: the connection, and the database or collection. */
export function ConsoleTargetPill({ tab }: { tab: Tab }) {
  const color = useConnectionColor(tab.connection.id);
  const target = tab.kind === "collection" ? `${tab.database}.${tab.collection}` : tab.database;

  return (
    <span
      className="inline-flex h-[26px] min-w-0 shrink items-center gap-1.5 rounded-md bg-fg/6 px-2 text-sm text-fg-2"
      title={`Runs against ${target} on ${tab.connection.name} (${tab.connection.summary})`}
    >
      <ConnectionChip name={tab.connection.name} color={color} size="sm" />
      <span className="truncate font-data font-medium text-fg">{target}</span>
      {tab.kind === "console" && <span className="shrink-0 text-fg-3 @max-[820px]:hidden">any collection</span>}
      <span className="truncate @max-[600px]:hidden">on {tab.connection.name}</span>
    </span>
  );
}
