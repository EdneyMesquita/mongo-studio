import { Clock, Eye, Table } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RowContextMenu } from "@/components/common/ActionMenu";
import type { CollectionInfo } from "../../types/connection";
import { Highlighted } from "./Highlighted";
import { TreeRow } from "./TreeRow";
import { collectionMenuEntries } from "./treeMenus";

const KIND_ICONS: Record<string, LucideIcon> = { view: Eye, timeseries: Clock };

interface CollectionRowProps {
  collection: CollectionInfo;
  database: string;
  depth: number;
  /** The active tab's collection. */
  selected: boolean;
  /** The sidebar search, lowercased; its match is picked out in the name. */
  query: string;
  onOpen: () => void;
  onOpenConsole: () => void;
}

/** A collection, view or time series; opens in a tab on click. */
export function CollectionRow({
  collection,
  database,
  depth,
  selected,
  query,
  onOpen,
  onOpenConsole,
}: CollectionRowProps) {
  const Icon = KIND_ICONS[collection.collectionType] ?? Table;
  const plain = collection.collectionType === "collection" || !collection.collectionType;

  return (
    <RowContextMenu
      entries={() =>
        collectionMenuEntries({
          database,
          collection: collection.name,
          onOpen,
          onOpenConsole,
        })
      }
    >
      <TreeRow
        depth={depth}
        selected={selected}
        title={collection.name}
        icon={<Icon className="size-3.5 shrink-0 text-fg-2" aria-hidden />}
        label={<Highlighted name={collection.name} query={query} />}
        trailing={!plain && <span>{collection.collectionType}</span>}
        onActivate={onOpen}
      />
    </RowContextMenu>
  );
}
