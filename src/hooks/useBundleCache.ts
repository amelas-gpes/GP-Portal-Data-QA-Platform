import { useCallback, useMemo, useRef } from 'react';
import type { ChartBundleSet, DashboardFilters, FormulaRegistry, WorkerComputeBundleSetPayload } from '../types';

// LRU bundle cache with tiered rawRows retention and a gated serial
// prefetcher, wrapping the worker's computeBundleSet. The worker's supersede
// semantics (a newer same-type request cancels older ones with AbortError)
// make parallel calls self-cancelling, so prefetch is strictly serial and only
// runs while no user-initiated compute is pending.

const CACHE_SIZE = 40;
const RAW_ROWS_HOT_ENTRIES = 12;
const PREFETCH_DELAY_MS = 200;

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Hash of only the draft formulas that differ from production. */
export function formulaHash(formulas: FormulaRegistry): string {
  const parts: string[] = [];
  for (const [id, metric] of Object.entries(formulas)) {
    if (metric.draftFormula !== metric.productionFormula) parts.push(`${id}=${metric.draftFormula}`);
  }
  if (!parts.length) return 'prod';
  return fnv1a(parts.sort().join('||'));
}

export function filtersHash(filters: DashboardFilters): string {
  return fnv1a(JSON.stringify(filters));
}

export function bundleCacheKey(payload: WorkerComputeBundleSetPayload): string {
  return [
    payload.logicVersion,
    formulaHash(payload.formulas),
    filtersHash(payload.filters),
    [...payload.investorKeys].sort().join(','),
    payload.includeIndividualBundles ? '1' : '0',
  ].join('|');
}

type CacheEntry = { set: ChartBundleSet; hasRawRows: boolean };

function stripRawRows(set: ChartBundleSet): ChartBundleSet {
  return {
    combined: { ...set.combined, rawRows: [] },
    individual: set.individual.map((bundle) => ({ ...bundle, rawRows: [] })),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useBundleCache(computeBundleSet: (payload: WorkerComputeBundleSetPayload) => Promise<ChartBundleSet>) {
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const userPendingRef = useRef(0);
  const prefetchTimerRef = useRef<number | null>(null);
  const prefetchQueueRef = useRef<WorkerComputeBundleSetPayload[]>([]);
  const prefetchRunningRef = useRef(false);

  const touch = useCallback((key: string, entry: CacheEntry) => {
    const cache = cacheRef.current;
    cache.delete(key);
    cache.set(key, entry);
    // Evict beyond capacity, strip rawRows beyond the hot tier.
    const keys = Array.from(cache.keys());
    if (keys.length > CACHE_SIZE) {
      for (const staleKey of keys.slice(0, keys.length - CACHE_SIZE)) cache.delete(staleKey);
    }
    const remaining = Array.from(cache.keys());
    const coldKeys = remaining.slice(0, Math.max(0, remaining.length - RAW_ROWS_HOT_ENTRIES));
    for (const coldKey of coldKeys) {
      const cold = cache.get(coldKey);
      if (cold && cold.hasRawRows) cache.set(coldKey, { set: stripRawRows(cold.set), hasRawRows: false });
    }
  }, []);

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    prefetchQueueRef.current = [];
  }, []);

  /**
   * Resolve a bundle set for the payload. A cached entry satisfies the request
   * unless the caller needs rawRows and the entry was computed (or stripped)
   * without them — then it refetches so evidence/simulation always have rows.
   */
  const getBundleSet = useCallback(async (payload: WorkerComputeBundleSetPayload): Promise<ChartBundleSet> => {
    cancelPrefetch();
    const wantRawRows = payload.includeRawRows ?? true;
    const key = bundleCacheKey(payload);
    const entry = cacheRef.current.get(key);
    if (entry && (entry.hasRawRows || !wantRawRows)) {
      touch(key, entry);
      return entry.set;
    }
    userPendingRef.current += 1;
    try {
      const set = await computeBundleSet(payload);
      touch(key, { set, hasRawRows: wantRawRows });
      return set;
    } finally {
      userPendingRef.current -= 1;
    }
  }, [cancelPrefetch, computeBundleSet, touch]);

  const runPrefetchQueue = useCallback(async () => {
    if (prefetchRunningRef.current) return;
    prefetchRunningRef.current = true;
    try {
      while (prefetchQueueRef.current.length) {
        if (userPendingRef.current > 0) return; // never compete with the user
        const payload = prefetchQueueRef.current.shift();
        if (!payload) return;
        const key = bundleCacheKey(payload);
        if (cacheRef.current.has(key)) continue; // any cached shape satisfies a step
        try {
          const set = await computeBundleSet(payload);
          touch(key, { set, hasRawRows: payload.includeRawRows ?? true });
        } catch (error) {
          if (!isAbortError(error)) return; // engine trouble: stop prefetching quietly
        }
      }
    } finally {
      prefetchRunningRef.current = false;
    }
  }, [computeBundleSet, touch]);

  /** Queue neighbor payloads for serial prefetch after a 200ms idle delay. */
  const schedulePrefetch = useCallback((payloads: WorkerComputeBundleSetPayload[]) => {
    cancelPrefetch();
    if (!payloads.length) return;
    prefetchQueueRef.current = payloads;
    prefetchTimerRef.current = window.setTimeout(() => {
      prefetchTimerRef.current = null;
      void runPrefetchQueue();
    }, PREFETCH_DELAY_MS);
  }, [cancelPrefetch, runPrefetchQueue]);

  const clear = useCallback(() => {
    cancelPrefetch();
    cacheRef.current.clear();
  }, [cancelPrefetch]);

  return useMemo(() => ({ getBundleSet, schedulePrefetch, clear }), [clear, getBundleSet, schedulePrefetch]);
}
