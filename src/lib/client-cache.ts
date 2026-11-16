/**
 * Client-side in-memory cache for instant route transitions (SWR pattern)
 * and avoiding redundant API fetches.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

export function getCached<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): T | undefined {
  if (typeof window === 'undefined') return undefined;
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(keyPrefix?: string): void {
  if (typeof window === 'undefined') return;
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

// Automatically clear cache on semester change across the entire app
if (typeof window !== 'undefined') {
  window.addEventListener('semester-changed', () => invalidateCache());
  window.addEventListener('semesters-updated', () => invalidateCache());
}
