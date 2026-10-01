import type { CollectionTab } from "../../store/sessionsStore";
import type { ExplainQueryInput } from "../../types/explain";
import { parseOptionalQueryObject, parseQueryArray, parseQueryObject } from "../../lib/queryText";

/** The tab's current query as explain input; throws `QuerySyntaxError` on text it can't read. */
export function explainQueryOf(tab: CollectionTab): ExplainQueryInput {
  if (tab.mode === "aggregate") {
    return {
      filter: {},
      sort: null,
      projection: null,
      limit: null,
      skip: null,
      pipeline: parseQueryArray(tab.pipelineText),
    };
  }
  return {
    filter: parseQueryObject(tab.filterText, "filter"),
    sort: parseOptionalQueryObject(tab.sortText, "sort"),
    projection: null,
    limit: null,
    skip: null,
    pipeline: null,
  };
}
