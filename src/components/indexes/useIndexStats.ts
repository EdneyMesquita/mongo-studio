import { useEffect, useState } from "react";
import { api } from "../../lib/tauri";
import { isPlainObject } from "../../lib/bsonValue";

/** What `$indexStats` says about one index, read from its relaxed EJSON. */
export interface IndexUsage {
  /** Operations that used the index since `since`. */
  ops: number | null;
  /** When counting started: server start or index creation. */
  since: Date | null;
  /** The index definition as `$indexStats` reports it. */
  spec: Record<string, unknown> | null;
}

/** Relaxed EJSON numbers are plain, but out-of-range longs keep a wrapper. */
function readNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (isPlainObject(value)) {
    const wrapped = value.$numberLong ?? value.$numberInt ?? value.$numberDouble;
    if (typeof wrapped === "string" && wrapped.trim() !== "") return Number(wrapped);
  }
  return null;
}

function readDate(value: unknown): Date | null {
  if (!isPlainObject(value)) return null;
  const raw = value.$date;
  const ms = typeof raw === "string" ? Date.parse(raw) : readNumber(raw);
  return ms === null || Number.isNaN(ms) ? null : new Date(ms);
}

function readUsage(entry: Record<string, unknown>): IndexUsage {
  const accesses = isPlainObject(entry.accesses) ? entry.accesses : {};
  return {
    ops: readNumber(accesses.ops),
    since: readDate(accesses.since),
    spec: isPlainObject(entry.spec) ? entry.spec : null,
  };
}

interface IndexStatsState {
  usageByName: Map<string, IndexUsage>;
  loading: boolean;
  /** `$indexStats` needs a privilege some users (and Atlas tiers) lack. */
  error: string | null;
}

/** Per-index usage counters for one collection, keyed by index name. */
export function useIndexStats(
  sessionId: string | undefined,
  database: string,
  collection: string,
): IndexStatsState {
  const [usageByName, setUsageByName] = useState<Map<string, IndexUsage>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId || !database || !collection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listIndexStats(sessionId, database, collection)
      .then((entries) => {
        if (cancelled) return;
        const map = new Map<string, IndexUsage>();
        for (const entry of entries) {
          if (isPlainObject(entry) && typeof entry.name === "string") {
            map.set(entry.name, readUsage(entry));
          }
        }
        setUsageByName(map);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, database, collection]);

  return { usageByName, loading, error };
}
