/** A side of a relation: which connection, database and collection (a `{tenant}` pattern allowed). */
export interface RelationSide {
  /** From: "any" or a connection id. To: "cluster", "same" or a connection id. */
  conn: string;
  db: string;
  coll: string;
}

export type RelationOp = "eq" | "prefix" | "in";
export type RelationBridge = "as-stored" | "uuid-string" | "guid-string" | "oid-string" | "number-string";

export interface RelationCondition {
  /** A From field path, or a template like "{customerId}-{key}". */
  from: string;
  op: RelationOp;
  /** A To field path. */
  to: string;
  as: RelationBridge;
}

/** Always applies to the To side, e.g. store = {tenant}. */
export interface RelationScope {
  to: string;
  value: string;
}

export interface RelationDraft {
  by: string;
  at: string;
  why: string;
}

export interface Relation {
  id: string;
  name: string;
  from: RelationSide;
  to: RelationSide;
  /** Alternative rules, tried in order per document; each needs all its conditions. */
  rules: RelationCondition[][];
  ruleNotes: string[];
  scope: RelationScope[];
  /** What the To documents are called from a From document, e.g. "shipments". */
  fromName: string;
  /** What the From document is called from a To document, e.g. "order". */
  toName: string;
  /** Per From connection id, the To connection picked by hand (null skips it). */
  pairs: Record<string, string | null>;
  draft: RelationDraft | null;
  createdAt: string;
  updatedAt: string;
}

export type RelationDir = "from" | "to";

export interface RelationAggregate {
  id: string;
  kind: "count" | "sum" | "exists" | "first";
  field?: string;
  whereField?: string;
  whereValue?: unknown;
}

export interface RelatedFound {
  count: number;
  /** The rule (index) that found them; null when nothing was found. */
  rule: number | null;
  docs: unknown[];
  aggregates: Record<string, unknown>;
}

export interface FindRelatedOutput {
  targetDatabase: string;
  targetCollection: string;
  /** One per source document, in order. */
  results: RelatedFound[];
  matched: number;
  truncated: boolean;
  ms: number;
}

export interface FindRelatedInput {
  relation: Relation;
  dir: RelationDir;
  source: { connectionId: string; database: string; collection: string };
  targetSessionId: string;
  documents: unknown[];
  aggregates?: RelationAggregate[];
  docsPerSource?: number;
}

export interface RelationSuggestion {
  from: string;
  to: string;
  op: RelationOp;
  as: RelationBridge;
  matched: number;
  sampled: number;
}

export interface RelationCheckLine {
  kind: "ok" | "warn" | "info";
  text: string;
  index: { database: string; collection: string; keys: string[] } | null;
}

export interface RelationCheckReport {
  lines: RelationCheckLine[];
  ruleMatches: number[];
  sampled: number;
  none: number;
}
