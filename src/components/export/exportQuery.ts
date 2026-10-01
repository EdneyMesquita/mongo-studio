import type { CollectionTab } from "../../store/sessionsStore";
import { parseOptionalQueryObject, parseQueryArray, parseQueryObject } from "../../lib/queryText";

export interface ExportQuery {
  filter: unknown;
  sort: unknown | null;
  pipeline: unknown | null;
  limit: number | null;
}

/** The tab's current query to export; throws `QuerySyntaxError` on text it can't read. */
export function exportQueryOf(tab: CollectionTab, capToLimit: boolean): ExportQuery {
  if (tab.mode === "aggregate") {
    return { filter: {}, sort: null, pipeline: parseQueryArray(tab.pipelineText), limit: null };
  }
  const filter = parseQueryObject(tab.filterText, "filter");
  const sort = parseOptionalQueryObject(tab.sortText, "sort");
  return { filter, sort, pipeline: null, limit: capToLimit ? tab.limit : null };
}
