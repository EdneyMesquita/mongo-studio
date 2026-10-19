import { Fragment, useMemo, useState } from "react";
import { Check, ChevronDown, Download, Funnel, Hash, Link, Sigma, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { columnKey, relationsOf } from "../../../lib/relations";
import { relatedSuggestions, type RelatedSuggestion } from "../../../lib/relatedView";
import { pageKey, useRelatedColumns, useRelatedStore } from "../../../store/relatedStore";
import { startRelation, useRelationsStore } from "../../../store/relationsStore";
import type { CollectionTab } from "../../../store/sessionsStore";

const ICONS: Record<RelatedSuggestion["icon"], LucideIcon> = {
  count: Hash,
  where: Funnel,
  sum: Sigma,
  exists: Check,
  first: Type,
};

/** The menu's entries, built when it opens from the related documents loaded so far. */
function RelatedMenuItems({ tab }: { tab: CollectionTab }) {
  const relations = useRelationsStore((s) => s.relations);
  const pages = useRelatedStore((s) => s.pages);
  const columns = useRelatedColumns(tab.id);
  const ends = useMemo(
    () => relationsOf(relations, tab.connection.id, tab.database, tab.collection),
    [relations, tab.connection.id, tab.database, tab.collection],
  );
  const added = new Set(columns.map(columnKey));

  return (
    <>
      {ends.map((end) => {
        const results = pages[pageKey(tab.id, end.relation.id, end.dir)]?.output?.results ?? [];
        return (
          <Fragment key={`${end.relation.id}|${end.dir}`}>
            <DropdownMenuLabel className="truncate">
              {end.name} · {end.other.coll.replace("{tenant}", "*")}
            </DropdownMenuLabel>
            {relatedSuggestions(end, results).map((s) => {
              const Icon = ICONS[s.icon];
              const there = added.has(columnKey(s.column));
              return (
                <DropdownMenuItem
                  key={s.column.id}
                  disabled={there}
                  onSelect={() => useRelatedStore.getState().addColumn(tab.id, s.column)}
                >
                  <Icon className="size-3.5" />
                  <span className="flex-1 truncate">{s.label}</span>
                  {there && <span className="text-xs text-fg-3">added</span>}
                </DropdownMenuItem>
              );
            })}
          </Fragment>
        );
      })}
      {ends.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={() => startRelation(tab.connection, tab.database, tab.collection)}>
        <Link className="size-3.5" />
        <span className="flex-1 truncate">Relate to another collection…</span>
      </DropdownMenuItem>
      {/* a disabled item takes no pointer events: the wrapper carries the title */}
      <div title="Exporting with related columns comes in a later version">
        <DropdownMenuItem disabled>
          <Download className="size-3.5" />
          <span className="flex-1 truncate">Export with related columns…</span>
        </DropdownMenuItem>
      </div>
    </>
  );
}

/**
 * The Related button over a collection's results: Related columns to add
 * per relation end, relating the collection to another one, export.
 */
export function RelatedMenu({ tab }: { tab: CollectionTab }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-haspopup="menu" className="gap-1">
          <Link />
          <span>Related</span>
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      {open && (
        <DropdownMenuContent align="end" className="min-w-64">
          <RelatedMenuItems tab={tab} />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
