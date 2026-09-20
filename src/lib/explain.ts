interface PlanNode {
  stage?: string;
  indexName?: string;
  inputStage?: PlanNode;
  inputStages?: PlanNode[];
  [key: string]: unknown;
}

function asPlanNode(value: unknown): PlanNode | undefined {
  return typeof value === "object" && value !== null ? (value as PlanNode) : undefined;
}

function nextStage(node: PlanNode): PlanNode | undefined {
  return node.inputStage ?? node.inputStages?.[0];
}

/** Walks a winningPlan's inputStage chain, collecting stage names root-first. */
export function collectStages(plan: unknown): string[] {
  const stages: string[] = [];
  let node = asPlanNode(plan);
  while (node) {
    if (typeof node.stage === "string") stages.push(node.stage);
    node = nextStage(node);
  }
  return stages;
}

/** Finds the first indexName anywhere in the winningPlan chain, if any. */
export function findIndexName(plan: unknown): string | null {
  let node = asPlanNode(plan);
  while (node) {
    if (typeof node.indexName === "string") return node.indexName;
    node = nextStage(node);
  }
  return null;
}

export interface ExplainSummary {
  stages: string[];
  indexName: string | null;
  usesCollectionScan: boolean;
  nReturned: number | null;
  totalKeysExamined: number | null;
  totalDocsExamined: number | null;
  executionTimeMillis: number | null;
}

/**
 * Best-effort summary across find-explain shape ({queryPlanner,
 * executionStats}) and aggregate-explain shape (queryPlanner may be nested
 * under stages[0].$cursor). Falls back to nulls/empty when the shape isn't
 * recognized - the raw JSON is always shown alongside this for that case.
 */
export function summarizeExplain(explain: unknown): ExplainSummary {
  const root = asPlanNode(explain) ?? {};
  const stagesArray = Array.isArray(root.stages) ? root.stages : null;
  const cursorStage = stagesArray
    ?.map((s) => asPlanNode(s)?.["$cursor"])
    .find((c) => c !== undefined);

  const queryPlanner =
    asPlanNode(root.queryPlanner) ?? asPlanNode(asPlanNode(cursorStage)?.queryPlanner);
  const executionStats =
    asPlanNode(root.executionStats) ?? asPlanNode(asPlanNode(cursorStage)?.executionStats);

  const winningPlan = queryPlanner?.winningPlan;
  const stages = collectStages(winningPlan);
  const indexName = findIndexName(winningPlan);

  return {
    stages,
    indexName,
    usesCollectionScan: stages.includes("COLLSCAN"),
    nReturned: typeof executionStats?.nReturned === "number" ? executionStats.nReturned : null,
    totalKeysExamined:
      typeof executionStats?.totalKeysExamined === "number"
        ? executionStats.totalKeysExamined
        : null,
    totalDocsExamined:
      typeof executionStats?.totalDocsExamined === "number"
        ? executionStats.totalDocsExamined
        : null,
    executionTimeMillis:
      typeof executionStats?.executionTimeMillis === "number"
        ? executionStats.executionTimeMillis
        : null,
  };
}
