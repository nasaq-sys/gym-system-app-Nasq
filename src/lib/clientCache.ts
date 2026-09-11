/**
 * Ultra Gym - Client-Side Cache (SWR & In-Memory Store)
 * Eliminates redundant network requests when navigating between pages.
 * Provides instant 0ms page loads with background revalidation.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const clientMemoryStore = new Map<string, CacheEntry<unknown>>();
const pendingPromises = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(data: unknown) => void>>();

export interface ClientCacheOptions {
  ttlMs?: number; // Time in ms before cached data is considered stale (default: 60s)
  forceRefresh?: boolean;
}

/**
 * Fetches data with client-side caching & SWR (Stale-While-Revalidate).
 * If fresh cached data exists, returns it immediately without calling fetch.
 * If stale cached data exists, returns it immediately AND triggers background revalidation.
 */
export async function clientFetch<T>(
  url: string,
  options?: RequestInit,
  cacheOptions?: ClientCacheOptions
): Promise<T> {
  const ttlMs = cacheOptions?.ttlMs ?? 60000; // 60 seconds default TTL
  const forceRefresh = cacheOptions?.forceRefresh ?? false;
  const now = Date.now();

  const cached = clientMemoryStore.get(url) as CacheEntry<T> | undefined;

  // 1. Fresh cache hit -> return immediately
  if (!forceRefresh && cached && now - cached.timestamp < ttlMs) {
    return cached.data;
  }

  // 2. Dedup ongoing in-flight request for the exact same URL
  if (pendingPromises.has(url)) {
    return pendingPromises.get(url) as Promise<T>;
  }

  // 3. Initiate fetch
  const fetchPromise = (async () => {
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        ...options,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} on ${url}`);
      }

      const json = await res.json();
      const payload = (json?.data !== undefined ? json.data : json) as T;

      // Save to memory cache
      clientMemoryStore.set(url, {
        data: payload,
        timestamp: Date.now(),
      });

      // Notify any active UI listeners
      const urlListeners = listeners.get(url);
      if (urlListeners) {
        urlListeners.forEach((fn) => {
          try {
            fn(payload);
          } catch {}
        });
      }

      return payload;
    } finally {
      pendingPromises.delete(url);
    }
  })();

  pendingPromises.set(url, fetchPromise);

  // If we had stale data, return it immediately while fetchPromise resolves in background
  if (!forceRefresh && cached && cached.data !== undefined) {
    return cached.data;
  }

  return fetchPromise;
}

/**
 * Invalidate a specific cached URL or a prefix (e.g. after POST / PUT mutations).
 */
export function invalidateClientCache(urlOrPrefix?: string): void {
  if (!urlOrPrefix) {
    clientMemoryStore.clear();
    return;
  }

  for (const key of clientMemoryStore.keys()) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      clientMemoryStore.delete(key);
    }
  }
}

/**
 * Directly update client cache (Optimistic UI updates).
 */
export function setClientCacheData<T>(url: string, data: T): void {
  clientMemoryStore.set(url, {
    data,
    timestamp: Date.now(),
  });

  const urlListeners = listeners.get(url);
  if (urlListeners) {
    urlListeners.forEach((fn) => {
      try {
        fn(data);
      } catch {}
    });
  }
}

/**
 * Synchronous read from cache if available.
 */
export function getClientCachedData<T>(url: string): T | null {
  const entry = clientMemoryStore.get(url) as CacheEntry<T> | undefined;
  return entry ? entry.data : null;
}
