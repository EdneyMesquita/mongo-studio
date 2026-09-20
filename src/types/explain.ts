export type ExplainVerbosity = "query_planner" | "execution_stats" | "all_plans_execution";

export interface ExplainQueryInput {
  filter: unknown;
  sort: unknown | null;
  projection: unknown | null;
  limit: number | null;
  skip: number | null;
  pipeline: unknown | null;
}
