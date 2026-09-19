export interface FindQueryInput {
  filter: unknown;
  sort: unknown | null;
  projection: unknown | null;
  limit: number | null;
  skip: number | null;
}

export interface QueryResultPage {
  documents: unknown[];
  returned: number;
}

export interface IndexInfo {
  name: string;
  key: unknown;
  unique: boolean;
}

export interface CollectionStats {
  documentCount: number;
  indexes: IndexInfo[];
}
