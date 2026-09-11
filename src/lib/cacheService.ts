import {
  getFromRedis,
  setInRedis,
  deleteFromRedis,
  acquireLock,
  extendLock,
  releaseLock,
} from "@/lib/redisClient";
import { airtableMetrics } from "@/lib/airtableMetrics";
import { type MetricResource, mapTableToLogicalSource } from "@/lib/metricsService";
import { randomUUID } from "crypto";

/**
 * Derives canonical MetricResource identifier from a cache key or logTag.
 */
export function deriveResourceFromKey(key: string, logTag?: string): MetricResource {
  const target = (logTag || key).toLowerCase();
  if (target.includes("subscription") || target.includes("freeze")) return "subscriptions";
  if (target.includes("attendance")) return "attendance";
  if (target.includes("live:count") || target.includes("live_count") || target.includes("gym_count")) return "live_count";
  if (target.includes("member:profile") || target.includes("member:dashboard")) return "members";
  if (target.includes("member:stats") || target.includes("inbody")) return "inbody";
  if (target.includes("notifications")) return "notifications";
  if (target.includes("events:page") || target.includes("events")) return "events";
  if (target.includes("classes")) return "classes";
  if (target.includes("workouts") || target.includes("exercises")) return "workouts";
  if (target.includes("store")) return "store";
  if (target.includes("cafe")) return "cafe";
  if (target.includes("foods") || target.includes("nutrition")) return "nutrition";
  if (target.includes("meal_calculator") || target.includes("meal-calculator")) return "meal_calculator";
  if (target.includes("faq") || target.includes("chat")) return "chat_faq";
  if (target.includes("lost_found") || target.includes("lost-found")) return "lost_found";
  if (target.includes("admin:overview")) return "admin_overview";
  if (target.includes("admin:members")) return "admin_members";
  if (target.includes("trainer")) return "trainer";
  if (target.includes("facilities")) return "facilities";
  if (target.includes("equipment")) return "equipment";
  if (target.includes("accounting")) return "accounting";
  if (target.includes("staff")) return "staff";
  if (target.includes("auth") || target.includes("user_auth")) return "auth";
  return mapTableToLogicalSource(target);
}

/**
 * Explicit Negative Cache Sentinel to ensure null/undefined/falsy values
 * are NEVER accidentally interpreted as a Cache MISS.
 */
export const NEGATIVE_CACHE_SENTINEL = "__ULTRA_GYM_NEGATIVE_CACHE_SENTINEL__";

/**
 * Standardized, unified Redis cache keys for Ultra Gym.
 * All keys follow the "ultra-gym:<namespace>:<entity>" convention.
 */
export const REDIS_KEYS = {
  // Member portal (Personal Data)
  MEMBER_PROFILE: (recordId: string) => `ultra-gym:member:profile:${recordId}`,
  MEMBER_STATS: (recordId: string) => `ultra-gym:member:stats:${recordId}`,
  MEMBER_NOTIFICATIONS: (recordId: string) => `ultra-gym:member:notifications:${recordId}`,
  MEMBER_DASHBOARD: (recordId: string) => `ultra-gym:member:dashboard:${recordId}`,
  MEMBER_WORKOUTS: (recordId: string) => `ultra-gym:member:workouts:${recordId}`,
  MEMBER_EXERCISES: (recordId: string) => `ultra-gym:member:exercises:${recordId}`,

  // Shared application state & Calendars
  EVENTS_PAGE: "ultra-gym:events:page",
  GYM_COUNT: "ultra-gym:live:count",
  ATTENDANCE_MONTH: (monthKey: string) => `ultra-gym:attendance:month:${monthKey}`,
  EXERCISES: "ultra-gym:workouts:exercises:all",
  STORE_PRODUCTS: "ultra-gym:store:products:all",
  CAFE_MENU: "ultra-gym:cafe:menu:all",
  CHAT_FAQ: "ultra-gym:chat:faq:all",
  FOOD_CATALOG: "ultra-gym:foods:catalog:all",
  LOST_FOUND: "ultra-gym:lost_found:all",

  // Portal consoles
  ADMIN_OVERVIEW: "ultra-gym:admin:overview",
  TRAINER_TRAINEES: (trainerRecordId: string) => `ultra-gym:trainer:trainees:${trainerRecordId}`,
  USER_AUTH: (email: string) => `user_auth_${email.toLowerCase().trim()}`,
} as const;

export interface CacheWrapper<T> {
  payload: T;
  cachedAt: number;
  isNegative?: boolean;
  sentinel?: string;
}

export interface CacheResult<T> {
  data: T;
  source: "redis_hit" | "airtable_fresh" | "airtable_fallback";
  latencyMs: number;
  isStale?: boolean;
  isNegative?: boolean;
}

// In-flight background revalidations to avoid duplicate parallel Airtable calls in current process
const backgroundRevalidations = new Set<string>();

// Process-local inFlightMisses map to coalesce requests on the same serverless instance
export const inFlightMisses = new Map<string, Promise<unknown>>();

/**
 * Schedules non-blocking background work with full Next.js 16 serverless lifecycle support.
 */
function scheduleBackgroundWork(work: () => Promise<void>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require("next/server");
    if (typeof after === "function") {
      after(work);
      return;
    }
  } catch {
    // Fallback when outside Next.js request context (e.g. CLI or unit tests)
  }
  Promise.resolve().then(work).catch((e) => {
    console.warn("[CacheService] Background task error:", e);
  });
}

function extractPayload<T>(
  cached: CacheWrapper<T> | T,
  defaultCachedAt: number
): { payload: T; cachedAt: number; isNegative: boolean } {
  if (
    typeof cached === "object" &&
    cached !== null &&
    ("payload" in cached || "sentinel" in cached)
  ) {
    const wrapped = cached as CacheWrapper<T>;
    const isNeg = wrapped.isNegative === true || wrapped.sentinel === NEGATIVE_CACHE_SENTINEL;
    return {
      payload: isNeg ? (null as unknown as T) : wrapped.payload,
      cachedAt: wrapped.cachedAt || defaultCachedAt,
      isNegative: isNeg,
    };
  }
  return { payload: cached as T, cachedAt: defaultCachedAt, isNegative: false };
}

/**
 * Executes a Redis-First Stale-While-Revalidate (SWR) cache-aside fetch with:
 * 1. Process-local Single-Flight Promise Coalescing (`inFlightMisses`).
 * 2. Cross-Lambda Distributed Locking on Cache MISS (`ultra-gym:miss_lock:${key}`).
 * 3. Automatic Heartbeat Lock Lease Renewal during in-flight Airtable fetches.
 * 4. Double-checked Redis re-validation before querying Airtable.
 * 5. Bounded exponential backoff + jitter for waiting instances.
 * 6. Ownership-safe lock release (compare-and-delete via Lua).
 * 7. Sentinel-protected negative-result caching for non-existent / null records.
 */
export async function withCacheSWR<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttlSeconds?: number;
    softTtlSeconds?: number;
    logTag?: string;
    resource?: MetricResource;
    /** Optional custom inFlightMap (used for testing simulated isolated Lambda instances) */
    customInFlightMap?: Map<string, Promise<unknown>>;
    /** Override lock TTL in seconds (default: 15s) */
    lockTtlSeconds?: number;
    /** Override heartbeat renewal interval in ms (default: 4000ms) */
    heartbeatIntervalMs?: number;
  } = {}
): Promise<CacheResult<T>> {
  const {
    ttlSeconds = 604800, // 7 days hard TTL
    softTtlSeconds = 1800, // 30 minutes soft TTL
    logTag = key,
    resource,
    customInFlightMap,
    lockTtlSeconds = 15,
    heartbeatIntervalMs = 4000,
  } = options;

  const canonicalResource: MetricResource = resource || deriveResourceFromKey(key, logTag);
  const localMap = customInFlightMap || inFlightMisses;
  const startTime = Date.now();
  const revalLockKey = `ultra-gym:reval_lock:${key}`;
  const missLockKey = `ultra-gym:miss_lock:${key}`;

  // ── Step 1: Initial Redis Read ──────────────────────────────────────────
  try {
    const cached = await getFromRedis<CacheWrapper<T> | T>(key);

    if (cached !== null && cached !== undefined) {
      const latencyMs = Date.now() - startTime;
      const { payload, cachedAt, isNegative } = extractPayload(cached, startTime);

      const ageSeconds = Math.max(0, (Date.now() - cachedAt) / 1000);
      const isStale = isNegative ? false : ageSeconds > softTtlSeconds;

      airtableMetrics.recordRedisHit(isStale, canonicalResource);

      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[PERF] ⚡ Redis HIT "${logTag}" | Latency: ${latencyMs}ms | Age: ${Math.round(ageSeconds)}s | Stale: ${isStale} | Negative: ${isNegative}`
        );
      }

      // If FRESH or NEGATIVE CACHE HIT: RETURN IMMEDIATELY — ZERO AIRTABLE CALLS
      if (!isStale) {
        return {
          data: payload,
          source: "redis_hit",
          latencyMs,
          isStale: false,
          isNegative,
        };
      }

      // If STALE: Trigger background revalidation protected by distributed lock
      if (!backgroundRevalidations.has(key)) {
        backgroundRevalidations.add(key);

        scheduleBackgroundWork(async () => {
          const bgStart = Date.now();
          const revalToken = randomUUID();
          try {
            const acquired = await acquireLock(revalLockKey, revalToken, 30);
            if (!acquired) {
              airtableMetrics.recordStampedeAvoided();
              return;
            }

            const freshData = await fetcher();
            if (freshData !== null && freshData !== undefined) {
              const wrapper: CacheWrapper<T> = {
                payload: freshData,
                cachedAt: Date.now(),
              };
              await setInRedis(key, wrapper, ttlSeconds);
              if (process.env.NODE_ENV !== "production") {
                console.log(
                  `[PERF] 🔄 Background Airtable revalidation for "${logTag}" completed in ${Date.now() - bgStart}ms`
                );
              }
            }
          } catch (bgErr) {
            console.warn(`[PERF] ⚠ Background revalidation failed for "${logTag}":`, bgErr);
          } finally {
            backgroundRevalidations.delete(key);
            await releaseLock(revalLockKey, revalToken).catch(() => {});
          }
        });
      } else {
        airtableMetrics.recordStampedeAvoided();
      }

      return {
        data: payload,
        source: "redis_hit",
        latencyMs,
        isStale: true,
        isNegative,
      };
    }
  } catch (redisErr) {
    console.warn(`[CacheService] Redis read failed for "${key}", falling back:`, redisErr);
  }

  // ── Step 2: Cache MISS → Process-Local Single-Flight Check ───────────────
  airtableMetrics.recordRedisMiss(canonicalResource);

  const existingLocalPromise = localMap.get(key) as Promise<T> | undefined;
  if (existingLocalPromise) {
    airtableMetrics.recordSingleFlightSavings();
    if (process.env.NODE_ENV !== "production") {
      console.log(`[PERF] 🔗 Local single-flight coalesced Cache MISS for "${logTag}"`);
    }
    const sharedData = await existingLocalPromise;
    return {
      data: sharedData,
      source: "airtable_fresh",
      latencyMs: Date.now() - startTime,
      isNegative: sharedData === null || sharedData === undefined,
    };
  }

  // ── Step 3: Cross-Instance Distributed Cache MISS Lock with Lease Renewal ─
  const missExecutionPromise = (async (): Promise<T> => {
    const lockToken = randomUUID();
    let hasLock = await acquireLock(missLockKey, lockToken, lockTtlSeconds);

    if (hasLock) {
      airtableMetrics.recordMissLockAcquired();

      // Start Keep-Alive Lease Renewal Heartbeat to ensure long Airtable fetches never outlive lock
      let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
        try {
          await extendLock(missLockKey, lockToken, lockTtlSeconds);
        } catch {
          // Ignore transient renewal error
        }
      }, heartbeatIntervalMs);

      try {
        // Double-check Redis in case another instance populated it before we acquired the lock
        const doubleCheck = await getFromRedis<CacheWrapper<T> | T>(key);
        if (doubleCheck !== null && doubleCheck !== undefined) {
          const { payload } = extractPayload(doubleCheck, Date.now());
          return payload;
        }

        // Authoritative fetch from Airtable
        const fetchStart = Date.now();
        airtableMetrics.recordMissAirtableFetch();
        const freshData = await fetcher();
        const fetchLatency = Date.now() - fetchStart;

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[PERF] 📥 Authoritative Airtable FETCH "${logTag}" | Latency: ${fetchLatency}ms`
          );
        }

        // Store result in Redis BEFORE releasing lock with explicit Sentinel for negative results
        const isNegative = freshData === null || freshData === undefined;
        const actualTtl = isNegative ? 60 : ttlSeconds; // 60s negative cache
        const wrapper: CacheWrapper<T> = {
          payload: freshData,
          cachedAt: Date.now(),
          isNegative,
          sentinel: isNegative ? NEGATIVE_CACHE_SENTINEL : undefined,
        };

        await setInRedis(key, wrapper, actualTtl);
        return freshData;
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        await releaseLock(missLockKey, lockToken);
      }
    }

    // ── Step 4: Lock Contended (Waiting Lambda Instances) ───────────────────
    airtableMetrics.recordMissLockContended();

    // Bounded exponential backoff with jitter
    const backoffDelays = [40, 80, 150, 250, 350, 500, 700, 1000];
    const maxWaitTimeMs = 8000;
    const waitStartTime = Date.now();

    for (let i = 0; i < backoffDelays.length; i++) {
      const jitter = Math.floor(Math.random() * 20);
      const sleepMs = backoffDelays[i] + jitter;
      await new Promise((resolve) => setTimeout(resolve, sleepMs));

      airtableMetrics.recordRedisWaitCheck();
      const checkRedis = await getFromRedis<CacheWrapper<T> | T>(key);
      if (checkRedis !== null && checkRedis !== undefined) {
        airtableMetrics.recordMissWaitResolved();
        const { payload } = extractPayload(checkRedis, Date.now());
        return payload;
      }

      if (Date.now() - waitStartTime >= maxWaitTimeMs) {
        break;
      }
    }

    // If still empty after waiting (e.g. lock owner crashed), compete for a new recovery lock
    airtableMetrics.recordMissLockExpired();
    const recoveryToken = randomUUID();
    hasLock = await acquireLock(missLockKey, recoveryToken, lockTtlSeconds);

    if (hasLock) {
      airtableMetrics.recordMissLockAcquired();
      let recoveryHeartbeat: NodeJS.Timeout | null = setInterval(async () => {
        try {
          await extendLock(missLockKey, recoveryToken, lockTtlSeconds);
        } catch {}
      }, heartbeatIntervalMs);

      try {
        const doubleCheck2 = await getFromRedis<CacheWrapper<T> | T>(key);
        if (doubleCheck2 !== null && doubleCheck2 !== undefined) {
          const { payload } = extractPayload(doubleCheck2, Date.now());
          return payload;
        }

        airtableMetrics.recordMissAirtableFetch();
        const recoveryData = await fetcher();
        const isNegative = recoveryData === null || recoveryData === undefined;
        const actualTtl = isNegative ? 60 : ttlSeconds;
        const wrapper: CacheWrapper<T> = {
          payload: recoveryData,
          cachedAt: Date.now(),
          isNegative,
          sentinel: isNegative ? NEGATIVE_CACHE_SENTINEL : undefined,
        };
        await setInRedis(key, wrapper, actualTtl);
        return recoveryData;
      } finally {
        if (recoveryHeartbeat) {
          clearInterval(recoveryHeartbeat);
          recoveryHeartbeat = null;
        }
        await releaseLock(missLockKey, recoveryToken);
      }
    }

    // Fallback: Final read from Redis or direct fetcher as last resort
    const finalCheck = await getFromRedis<CacheWrapper<T> | T>(key);
    if (finalCheck !== null && finalCheck !== undefined) {
      const { payload } = extractPayload(finalCheck, Date.now());
      return payload;
    }

    airtableMetrics.recordMissAirtableFetch();
    return await fetcher();
  })();

  localMap.set(key, missExecutionPromise);

  try {
    const result = await missExecutionPromise;
    return {
      data: result,
      source: "airtable_fresh",
      latencyMs: Date.now() - startTime,
      isNegative: result === null || result === undefined,
    };
  } finally {
    localMap.delete(key);
  }
}

/**
 * Surgical cache invalidation functions
 */
export async function invalidateMemberCache(memberRecordId: string): Promise<void> {
  if (!memberRecordId) return;
  await Promise.allSettled([
    deleteFromRedis(REDIS_KEYS.MEMBER_PROFILE(memberRecordId)),
    deleteFromRedis(REDIS_KEYS.MEMBER_STATS(memberRecordId)),
    deleteFromRedis(REDIS_KEYS.MEMBER_NOTIFICATIONS(memberRecordId)),
    deleteFromRedis(REDIS_KEYS.MEMBER_DASHBOARD(memberRecordId)),
    deleteFromRedis(REDIS_KEYS.MEMBER_WORKOUTS(memberRecordId)),
    deleteFromRedis(REDIS_KEYS.MEMBER_EXERCISES(memberRecordId)),
  ]);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated member cache for: ${memberRecordId}`);
  }
}

export async function invalidateNotificationsCache(memberRecordId: string): Promise<void> {
  if (!memberRecordId) return;
  await deleteFromRedis(REDIS_KEYS.MEMBER_NOTIFICATIONS(memberRecordId));
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated notifications cache for: ${memberRecordId}`);
  }
}

export async function invalidateAdminOverviewCache(): Promise<void> {
  await Promise.allSettled([
    deleteFromRedis(REDIS_KEYS.ADMIN_OVERVIEW),
    deleteFromRedis("ultra-gym:admin:members:list"),
  ]);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated admin overview & members list cache`);
  }
}

export async function invalidateTrainerCache(trainerRecordId: string): Promise<void> {
  if (!trainerRecordId) return;
  await deleteFromRedis(REDIS_KEYS.TRAINER_TRAINEES(trainerRecordId));
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated trainer cache for: ${trainerRecordId}`);
  }
}

export async function invalidateEventsCache(): Promise<void> {
  await Promise.allSettled([
    deleteFromRedis(REDIS_KEYS.EVENTS_PAGE),
    deleteFromRedis("ultra-gym:events:all"),
  ]);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { revalidateTag } = require("next/cache");
    if (typeof revalidateTag === "function") {
      revalidateTag("classes", "max");
      revalidateTag("events", "max");
      revalidateTag("waiting_list", "max");
    }
  } catch {}
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated events cache`);
  }
}

export async function invalidateStoreCache(): Promise<void> {
  await deleteFromRedis(REDIS_KEYS.STORE_PRODUCTS);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated store products cache`);
  }
}

export async function invalidateCafeCache(): Promise<void> {
  await deleteFromRedis(REDIS_KEYS.CAFE_MENU);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated cafe menu cache`);
  }
}

export async function invalidateAttendanceCache(monthKey?: string): Promise<void> {
  if (monthKey) {
    await deleteFromRedis(REDIS_KEYS.ATTENDANCE_MONTH(monthKey));
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated attendance cache`);
  }
}

export async function invalidateWorkoutsCache(memberRecordId?: string): Promise<void> {
  if (memberRecordId) {
    await Promise.allSettled([
      deleteFromRedis(`ultra-gym:workouts:schedules:${memberRecordId}`),
      deleteFromRedis(REDIS_KEYS.MEMBER_WORKOUTS(memberRecordId)),
      deleteFromRedis(REDIS_KEYS.MEMBER_EXERCISES(memberRecordId)),
    ]);
  }
  await deleteFromRedis(REDIS_KEYS.EXERCISES);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated workouts cache for: ${memberRecordId}`);
  }
}

export async function invalidateNutritionCache(memberRecordId?: string): Promise<void> {
  if (memberRecordId) {
    await deleteFromRedis(`ultra-gym:member:nutrition:${memberRecordId}`);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { revalidateTag } = require("next/cache");
    if (typeof revalidateTag === "function") {
      revalidateTag("nutrition-plans", "max");
      revalidateTag("nutrition-templates", "max");
    }
  } catch {}
  if (process.env.NODE_ENV !== "production") {
    console.log(`[PERF] 🗑 Invalidated nutrition cache for: ${memberRecordId}`);
  }
}
