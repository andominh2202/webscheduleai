/**
 * Client-side in-memory LRU cache with TTL and in-flight request deduplication
 * for instant route/tab transitions (SWR pattern) without memory leaks or duplicate fetches.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 100;
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

const cache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
let invalidationEpoch = 0;

function pruneCacheIfNeeded(now: number): void {
  if (cache.size < MAX_CACHE_ENTRIES) return;

  // First pass: remove expired entries using default TTL
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > DEFAULT_TTL_MS) {
      cache.delete(key);
    }
  }

  // Second pass: evict oldest (LRU) entries until below capacity
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export function getCached<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): T | undefined {
  if (typeof window === 'undefined') return undefined;
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;

  if (Date.now() - entry.timestamp > maxAgeMs) {
    cache.delete(key);
    return undefined;
  }

  // Refresh insertion order for LRU behavior while keeping original timestamp
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (cache.has(key)) {
    cache.delete(key);
  } else {
    pruneCacheIfNeeded(now);
  }
  cache.set(key, { data, timestamp: now });
}

export function invalidateCache(keyPrefix?: string): void {
  if (typeof window === 'undefined') return;
  invalidationEpoch += 1;

  if (!keyPrefix) {
    cache.clear();
    inFlightRequests.clear();
    return;
  }

  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
  for (const key of Array.from(inFlightRequests.keys())) {
    if (key.startsWith(keyPrefix)) {
      inFlightRequests.delete(key);
    }
  }
}

/**
 * Deduplicates concurrent identical requests in-flight so rapid tab/component mounts
 * share a single network call instead of firing duplicate fetches.
 */
export function dedupeRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') {
    return fetcher();
  }

  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = fetcher().finally(() => {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key);
    }
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Fetches data with optional SWR cache lookup + in-flight deduplication + epoch-safe writeback.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { maxAgeMs?: number; forceRefresh?: boolean }
): Promise<T> {
  if (!options?.forceRefresh) {
    const cached = getCached<T>(key, options?.maxAgeMs);
    if (cached !== undefined) {
      return cached;
    }
  }

  const startEpoch = invalidationEpoch;
  const data = await dedupeRequest(key, fetcher);

  if (startEpoch === invalidationEpoch) {
    setCached(key, data);
  }
  return data;
}

declare global {
  interface Window {
    __webscheduleCacheListenersBound?: boolean;
  }
}

// Automatically clear cache on semester change across the entire app (guarded against HMR duplicates)
if (typeof window !== 'undefined' && !window.__webscheduleCacheListenersBound) {
  window.__webscheduleCacheListenersBound = true;
  window.addEventListener('semester-changed', () => invalidateCache());
  window.addEventListener('semesters-updated', () => invalidateCache());
}
