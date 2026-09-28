import type { CollectionTab } from "../../store/sessionsStore";

export interface ExportQuery {
  filter: unknown;
  sort: unknown | null;
  pipeline: unknown | null;
  limit: number | null;
}

/** The tab's current query to export; throws on invalid JSON. */
export function exportQueryOf(tab: CollectionTab, capToLimit: boolean): ExportQuery {
  if (tab.mode === "aggregate") {
    const trimmed = tab.pipelineText.trim();
    return { filter: {}, sort: null, pipeline: trimmed ? JSON.parse(trimmed) : [], limit: null };
  }
  const filter = tab.filterText.trim() ? JSON.parse(tab.filterText) : {};
  const sort = tab.sortText.trim() ? JSON.parse(tab.sortText) : null;
  return { filter, sort, pipeline: null, limit: capToLimit ? tab.limit : null };
}
