import { useState } from "react";
import { ChevronRight, Link, Settings, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionChip } from "@/components/ui/ConnectionChip";
import { cn } from "@/lib/utils";
import { valueTitle } from "../../../lib/bsonFormat";
import { connectionColor } from "../../../lib/connectionColor";
import { otherCollection, type RelationEnd } from "../../../lib/relations";
import { linkFields, relatedDocLine } from "../../../lib/relatedView";
import { useConnectionsStore } from "../../../store/connectionsStore";
import type { RelatedPage } from "../../../store/relatedStore";
import { openRelationTab, startRelation } from "../../../store/relationsStore";
import type { CollectionTab } from "../../../store/sessionsStore";
import { BsonCell } from "../../grid/BsonCell";
import { connectRelated, OPEN_CAP, openAllRelated } from "./relatedActions";

/** Related documents shown per relation; the backend keeps as many. */
const SHOWN_DOCS = 5;

/** A text button, accent and underlined, inside a sentence. */
function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className="text-accent-text underline underline-offset-2 outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface RelatedEndProps {
  tab: CollectionTab;
  doc: unknown;
  index: number;
  end: RelationEnd;
  page: RelatedPage | undefined;
  open: boolean;
  onToggle: () => void;
}

/** One relation end: its name, how many there are and where they live; open, the documents. */
function RelatedEnd({ tab, doc, index, end, page, open, onToggle }: RelatedEndProps) {
  const profiles = useConnectionsStore((s) => s.profiles);
  const sessions = useConnectionsStore((s) => s.sessions);
  const connecting = useConnectionsStore((s) => s.connecting);
  const connectErrors = useConnectionsStore((s) => s.connectErrors);
  const targetId = page?.targetConnectionId ?? null;
  const target = targetId ? profiles.find((p) => p.id === targetId) : undefined;
  const live = targetId !== null && Boolean(sessions[targetId]);
  const found = page?.state === "ready" ? page.output?.results[index] : undefined;
  const database = page?.output?.targetDatabase ?? end.other.db;
  // per document: a {tenant} pattern may name another collection for each
  const collection = otherCollection(end, tab.collection, doc) ?? page?.output?.targetCollection ?? end.other.coll;
  const elsewhere = targetId !== null && targetId !== tab.connection.id;
  const loading = !page || page.state === "loading";
  const docs = found?.docs.slice(0, SHOWN_DOCS) ?? [];
  const skip = linkFields(end);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        className="flex h-[26px] w-full items-center gap-1.5 pr-2.5 pl-1.5 text-left text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        onClick={onToggle}
      >
        <span className="grid w-3.5 place-items-center text-fg-3">
          <ChevronRight className={cn("size-3 transition-transform duration-150 ease-out-expo", open && "rotate-90")} />
        </span>
        <span className="font-medium text-fg">{end.name}</span>
        {found ? (
          <span
            className={cn(
              "inline-grid h-4 min-w-[18px] place-items-center rounded-lg bg-fg/9 px-[5px] font-mono text-2xs leading-none font-semibold",
              found.count === 0 ? "text-fg-3" : "text-fg",
            )}
          >
            {found.count === 0 ? "none" : found.count.toLocaleString("en")}
          </span>
        ) : (
          loading && <span className="text-xs text-fg-3">…</span>
        )}
        <span
          className="ml-auto min-w-0 truncate text-xs text-fg-3"
          title={`${database}.${collection}${target ? ` on ${target.name}` : ""}`}
        >
          {elsewhere && target ? (
            <>
              <span className="mr-1 inline-block align-[0px]">
                <ConnectionChip name={target.name} color={connectionColor(target.id, target.color)} size="dot" />
              </span>
              {target.name}
            </>
          ) : (
            <span className="font-mono">{collection}</span>
          )}
        </span>
      </button>
      {page?.state === "error" && (
        <p className="truncate pr-2.5 pb-1.5 pl-[26px] text-sm text-danger" title={page.error ?? undefined}>
          Couldn't read the {end.name}: {page.error}
        </p>
      )}
      {page?.state === "ready" && targetId === null && (
        <p className="pr-2.5 pb-1.5 pl-[26px] text-sm text-fg-3">
          No {end.other.db} connection pairs with {tab.connection.name}.{" "}
          <LinkButton onClick={() => openRelationTab(end.relation.id)}>Pick one</LinkButton>
        </p>
      )}
      {page?.state === "ready" && targetId !== null && !live && (
        <p className="pr-2.5 pb-1.5 pl-[26px] text-sm text-fg-3">
          {connecting[targetId] ? (
            `Connecting to ${target?.name ?? targetId}…`
          ) : (
            <>
              {target?.name ?? targetId} isn't connected.{" "}
              <LinkButton onClick={() => connectRelated(targetId)}>Connect</LinkButton>
              {connectErrors[targetId] && (
                <span className="block truncate text-danger" title={connectErrors[targetId]}>
                  {connectErrors[targetId]}
                </span>
              )}
            </>
          )}
        </p>
      )}
      {open && found && (
        <div className="flex flex-col gap-0.5 pt-0.5 pr-2.5 pb-2 pl-[26px]">
          <div className="truncate px-0.5 pb-0.5 font-mono text-2xs text-fg-3">
            {database}.{collection}
          </div>
          {docs.length === 0 && <p className="py-0.5 text-sm text-fg-3">No {end.name} for this document.</p>}
          {docs.map((related, i) => {
            const line = relatedDocLine(related, skip);
            return (
              <div key={i} className="flex h-[22px] min-w-0 items-center gap-2.5 rounded-sm bg-fg/4 px-2 text-[11.5px] text-fg-2">
                <span className="shrink-0 font-mono text-xs text-fg-3">{line.id}</span>
                {line.fields.map(([key, value]) => (
                  <span key={key} className="min-w-0 truncate" title={`${key}: ${valueTitle(value)}`}>
                    <BsonCell value={value} />
                  </span>
                ))}
              </div>
            );
          })}
          {docs.length > 0 && targetId && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 self-start"
              title={found.count > OPEN_CAP ? `Opens the first ${OPEN_CAP.toLocaleString("en")}` : undefined}
              onClick={() =>
                void openAllRelated(
                  { connectionId: tab.connection.id, database: tab.database, collection: tab.collection },
                  end,
                  doc,
                  { connectionId: targetId, database, collection },
                  found.count,
                  found.docs,
                )
              }
            >
              <Table />
              {found.count === 1 ? "Open it in a tab" : `Open all ${found.count.toLocaleString("en")} in a tab`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface RelatedSectionProps {
  tab: CollectionTab;
  doc: unknown;
  /** The document's row in the page the related documents were found for. */
  index: number;
  ends: RelationEnd[];
  pages: Record<string, RelatedPage | undefined>;
}

/**
 * The inspector's Related section: per relation end of the collection, the
 * selected document's related documents on the other side, which may be
 * another database or connection.
 */
export function RelatedSection({ tab, doc, index, ends, pages }: RelatedSectionProps) {
  // which ends are open; kept while the selection moves
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <section aria-label="Related" className="mt-2.5 border-t border-line pt-1.5 pb-1 font-sans">
      {ends.length === 0 ? (
        <p className="flex items-center gap-1.5 px-2.5 py-2 text-sm text-fg-3">
          <Link className="size-3 shrink-0" aria-hidden />
          <span>No relations for {tab.collection} yet.</span>
          <LinkButton onClick={() => startRelation(tab.connection, tab.database, tab.collection)}>Relate a field…</LinkButton>
        </p>
      ) : (
        <>
          <h3 className="flex h-[26px] items-center gap-1.5 pr-1.5 pl-2.5 text-xs font-semibold tracking-[.04em] text-fg-2 uppercase">
            <Link className="size-3" aria-hidden />
            Related
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="icon-xs"
              title="Relations…"
              aria-label="Relations"
              onClick={() => openRelationTab(ends[0].relation.id)}
            >
              <Settings />
            </Button>
          </h3>
          {ends.map((end) => {
            const key = `${end.relation.id}|${end.dir}`;
            return (
              <RelatedEnd
                key={key}
                tab={tab}
                doc={doc}
                index={index}
                end={end}
                page={pages[key]}
                open={open.has(key)}
                onToggle={() => toggle(key)}
              />
            );
          })}
        </>
      )}
    </section>
  );
}
