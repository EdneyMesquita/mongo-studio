import type { CollectionTab } from "../../store/sessionsStore";
import type { ExplainQueryInput } from "../../types/explain";

/** The tab's current query as explain input; throws on invalid JSON. */
export function explainQueryOf(tab: CollectionTab): ExplainQueryInput {
  if (tab.mode === "aggregate") {
    return {
      filter: {},
      sort: null,
      projection: null,
      limit: null,
      skip: null,
      pipeline: tab.pipelineText.trim() ? JSON.parse(tab.pipelineText) : [],
    };
  }
  return {
    filter: tab.filterText.trim() ? JSON.parse(tab.filterText) : {},
    sort: tab.sortText.trim() ? JSON.parse(tab.sortText) : null,
    projection: null,
    limit: null,
    skip: null,
    pipeline: null,
  };
}
