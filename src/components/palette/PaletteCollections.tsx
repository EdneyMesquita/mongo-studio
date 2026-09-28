import { CommandGroup, CommandItem } from "@/components/ui/command";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { sessionIdFor } from "../../store/connectionsStore";
import { useSessionsStore } from "../../store/sessionsStore";
import { HighlightMatch } from "./HighlightMatch";
import { usePaletteCollections } from "./usePaletteCollections";
import type { PaletteCollection } from "./usePaletteCollections";

interface PaletteCollectionsProps {
  search: string;
  /** Closes the palette, then runs the choice. */
  run: (action: () => void) => void;
}

function open(item: PaletteCollection) {
  const sessionId = sessionIdFor(item.connection.id);
  if (!sessionId) return;
  useSessionsStore
    .getState()
    .openCollection(sessionId, item.connection, item.database, item.collection);
}

/** The palette's collections, from every connected server. */
export function PaletteCollections({ search, run }: PaletteCollectionsProps) {
  const collections = usePaletteCollections();
  if (collections.length === 0) return null;
  return (
    <CommandGroup heading="Collections">
      {collections.map((item) => {
        const label = `${item.database}.${item.collection}`;
        return (
          <CommandItem
            key={item.key}
            value={`collection:${item.key}`}
            keywords={[label, item.connection.name]}
            onSelect={() => run(() => open(item))}
          >
            <ConnectionChip name={item.connection.name} color={item.color} />
            <span className="min-w-0 truncate font-data">
              <HighlightMatch text={label} query={search} />
            </span>
            <span className="ml-auto shrink-0 pl-3 text-sm text-fg-3">{item.connection.name}</span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
