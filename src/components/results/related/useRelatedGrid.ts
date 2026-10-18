import { useMemo } from "react";
import type { RelatedCellData, RelatedGrid } from "../../grid/RelatedTableCell";
import { failsRelatedColumn, relatedColumnTitle, type RelatedColumn, type RelationEnd } from "../../../lib/relations";
import { relatedTotal } from "../../../lib/relatedView";
import { useRelatedColumns, useRelatedStore, type RelatedPage } from "../../../store/relatedStore";

/** A column's cell per document of the page, from its end's page. */
function cellsOf(col: RelatedColumn, page: RelatedPage | undefined, count: number): RelatedCellData[] {
  const out: RelatedCellData[] = [];
  for (let i = 0; i < count; i++) {
    if (!page || page.state === "loading") out.push({ state: "loading" });
    else if (page.state === "error") out.push({ state: "error" });
    else {
      const found = page.output?.results[i];
      out.push(found ? { state: "ready", value: found.aggregates[col.id] } : { state: "off" });
    }
  }
  return out;
}

export interface RelatedGridView {
  /** The page's documents shown, all of them unless a column's "only these" filter is on. */
  shown: unknown[];
  /** Each shown row's index in the page. */
  indexes: number[];
  filtered: boolean;
  grid: RelatedGrid | undefined;
}

/**
 * A tab's Related columns over a page: the cells per row, the rows a
 * column's "only these" filter leaves, the totals over them.
 */
export function useRelatedGrid(
  tabId: string,
  collection: string,
  documents: unknown[],
  ends: RelationEnd[],
  pages: Record<string, RelatedPage | undefined>,
): RelatedGridView {
  const columns = useRelatedColumns(tabId);
  const only = useRelatedStore((s) => s.only[tabId] ?? null);

  return useMemo(() => {
    const all = documents.map((_, i) => i);
    const shownCols = columns.filter((c) => ends.some((e) => e.relation.id === c.relationId && e.dir === c.dir));
    if (shownCols.length === 0) return { shown: documents, indexes: all, filtered: false, grid: undefined };
    const names = shownCols.map((c) => ends.find((e) => e.relation.id === c.relationId && e.dir === c.dir)!.name);
    // per column, per document
    const byColumn = shownCols.map((c) => cellsOf(c, pages[`${c.relationId}|${c.dir}`], documents.length));
    const onCol = only === null ? null : columns[only];
    const onAt = onCol ? shownCols.indexOf(onCol) : -1;
    // until its aggregates are in, a filter leaves every row
    const filterReady = onAt !== -1 && byColumn[onAt].every((d) => d.state !== "loading");
    const indexes = filterReady
      ? all.filter((i) => byColumn[onAt][i].state === "ready" && failsRelatedColumn(shownCols[onAt], byColumn[onAt][i].value))
      : all;
    const filtered = filterReady;
    const shown = filtered ? indexes.map((i) => documents[i]) : documents;
    const rows = documents.map((_, i) => byColumn.map((cells) => cells[i]));
    const grid: RelatedGrid = {
      columns: shownCols,
      titles: shownCols.map((c, i) => relatedColumnTitle(names[i], c)),
      cells: indexes.map((i) => rows[i]),
      totals: shownCols.map((c, k) =>
        byColumn[k].some((d) => d.state === "ready") ? relatedTotal(c, indexes.map((i) => byColumn[k][i].value)) : null,
      ),
      footer: `${indexes.length.toLocaleString("en")} ${collection}`,
      footerNote: filtered ? `of ${documents.length.toLocaleString("en")} on this page` : undefined,
    };
    return { shown, indexes, filtered, grid };
  }, [documents, columns, only, ends, pages, collection]);
}
