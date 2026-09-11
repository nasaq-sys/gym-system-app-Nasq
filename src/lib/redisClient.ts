import { Redis } from "@upstash/redis";
import { triggerRedisErrorAlert, reportRedisSuccess } from "@/lib/alerts";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL ||
  process.env.UPSTASH_REDIS_URL;

const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_TOKEN ||
  process.env.UPSTASH_REDIS_TOKEN;

export const isRedisConfigured = Boolean(redisUrl && redisToken);

// In-memory TTL fallback store when external Redis is not configured (e.g. local dev / tests)
const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();

function createMemoryRedisFallback(): Redis {
  return new Proxy({} as Redis, {
    get(_, prop) {
      if (prop === "get") {
        return async (k: string) => {
          const entry = memoryCache.get(k);
          if (!entry) return null;
          if (Date.now() > entry.expiresAt) {
            memoryCache.delete(k);
            return null;
          }
          return entry.value;
        };
      }
      if (prop === "set") {
        return async (k: string, v: unknown, opts?: { ex?: number; nx?: boolean }) => {
          if (opts?.nx) {
            const entry = memoryCache.get(k);
            if (entry && Date.now() <= entry.expiresAt) {
              return null;
            }
          }
          const ttlMs = (opts?.ex ?? 86400) * 1000;
          memoryCache.set(k, { value: v, expiresAt: Date.now() + ttlMs });
          return "OK";
        };
      }
      if (prop === "del") {
        return async (k: string) => {
          const existed = memoryCache.delete(k);
          return existed ? 1 : 0;
        };
      }
      if (prop === "eval") {
        return async (_script: string, keys: string[], args: unknown[]) => {
          const [key] = keys;
          const [expectedValue, secondArg] = args;
          const entry = memoryCache.get(key);
          if (!entry) return 0;
          if (Date.now() > entry.expiresAt) {
            memoryCache.delete(key);
            return 0;
          }
          if (entry.value === expectedValue) {
            if (secondArg !== undefined) {
              const newTtl = Number(secondArg);
              if (!isNaN(newTtl)) {
                entry.expiresAt = Date.now() + newTtl * 1000;
                return 1;
              }
            }
            memoryCache.delete(key);
            return 1;
          }
          return 0;
        };
      }
      if (prop === "hgetall") {
        return async (hashKey: string) => {
          const result: Record<string, string> = {};
          const prefix = hashKey + ":__hfield__:";
          for (const [k, v] of memoryCache.entries()) {
            if (k.startsWith(prefix) && Date.now() <= v.expiresAt) {
              result[k.slice(prefix.length)] = String(v.value);
            }
          }
          return Object.keys(result).length ? result : null;
        };
      }
      if (prop === "hincrby") {
        return async (hashKey: string, field: string, increment: number) => {
          const fieldKey = `${hashKey}:__hfield__:${field}`;
          const entry = memoryCache.get(fieldKey);
          const current = entry && Date.now() <= entry.expiresAt ? Number(entry.value) || 0 : 0;
          const newValue = current + increment;
          memoryCache.set(fieldKey, { value: newValue, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 });
          return newValue;
        };
      }
      if (prop === "hget") {
        return async (hashKey: string, field: string) => {
          const fieldKey = `${hashKey}:__hfield__:${field}`;
          const entry = memoryCache.get(fieldKey);
          if (!entry || Date.now() > entry.expiresAt) return null;
          return String(entry.value);
        };
      }
      if (prop === "ttl") {
        return async (key: string) => {
          const entry = memoryCache.get(key);
          if (entry) {
            return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
          }
          const prefix = key + ":__hfield__:";
          for (const [k, v] of memoryCache.entries()) {
            if (k.startsWith(prefix)) {
              return Math.max(0, Math.ceil((v.expiresAt - Date.now()) / 1000));
            }
          }
          return -2;
        };
      }
      return () => undefined;
    },
  }) as Redis;
}

export const redis: Redis =
  redisUrl && redisToken
    ? new Redis({ url: redisUrl, token: redisToken })
    : createMemoryRedisFallback();

export interface CachedUserData {
  id: string; // Airtable Record ID
  memberId: string;
  name: string;
  email: string;
  phone?: string;
  role: "member" | "trainer" | "admin";
  passwordHash: string; // Stored bcrypt hash or legacy password
  table: string;
  passwordField: string;
  existingStoredIp?: string | null;
  altRole?: "member" | "trainer" | "admin";
  altRecordId?: string;
  altMemberId?: string;
  altName?: string;
}

/**
 * Safe helper to query Redis cache with automatic error alerting and suppression
 * so any Redis outage triggers an alert and falls back transparently to Airtable without crashing.
 */
export async function getFromRedis<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured) {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }
  try {
    const data = await redis.get<T>(key);
    reportRedisSuccess();
    return data ?? null;
  } catch (err) {
    console.warn(`[Redis Cache-Aside Warning] Failed to get key "${key}":`, err);
    triggerRedisErrorAlert(err, `Redis GET on key "${key}"`);
    return null;
  }
}

/**
 * Safe helper to set data in Redis cache with TTL (Time-To-Live in seconds).
 * Default TTL is 86,400s (24 hours).
 */
export async function setInRedis<T>(
  key: string,
  value: T,
  ttlSeconds: number = 86400
): Promise<void> {
  if (!isRedisConfigured) {
    memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  try {
    await redis.set(key, value, { ex: ttlSeconds });
    reportRedisSuccess();
  } catch (err) {
    console.warn(`[Redis Cache-Aside Warning] Failed to set key "${key}":`, err);
    triggerRedisErrorAlert(err, `Redis SET on key "${key}"`);
  }
}

/**
 * Safe helper to invalidate/delete a specific Redis cache key.
 */
export async function deleteFromRedis(key: string): Promise<void> {
  if (!isRedisConfigured) {
    memoryCache.delete(key);
    return;
  }
  try {
    await redis.del(key);
    reportRedisSuccess();
  } catch (err) {
    console.warn(`[Redis Invalidation Warning] Failed to delete key "${key}":`, err);
    triggerRedisErrorAlert(err, `Redis DEL on key "${key}"`);
  }
}

/**
 * Atomically acquires a distributed lock using SET key token NX EX ttlSeconds.
 * Returns true if the lock was acquired, false if already held by another instance.
 */
export async function acquireLock(
  key: string,
  token: string,
  ttlSeconds: number = 15
): Promise<boolean> {
  if (!isRedisConfigured) {
    const entry = memoryCache.get(key);
    if (entry && Date.now() <= entry.expiresAt) {
      return false;
    }
    memoryCache.set(key, { value: token, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  try {
    const res = await redis.set(key, token, { nx: true, ex: ttlSeconds });
    return res === "OK";
  } catch (err) {
    console.warn(`[Redis Lock Warning] Failed to acquire lock "${key}":`, err);
    return false;
  }
}

/**
 * Ownership-safe lock lease renewal.
 * Atomically extends the expiration of the lock ONLY if the stored token matches the caller's token.
 */
export async function extendLock(
  key: string,
  token: string,
  ttlSeconds: number = 15
): Promise<boolean> {
  if (!isRedisConfigured) {
    const entry = memoryCache.get(key);
    if (entry && entry.value === token && Date.now() <= entry.expiresAt) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
      return true;
    }
    return false;
  }
  try {
    const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const res = await redis.eval(lua, [key], [token, ttlSeconds]);
    return res === 1;
  } catch (err) {
    console.warn(`[Redis Lock Warning] Failed to extend lock "${key}":`, err);
    return false;
  }
}

/**
 * Safely releases a distributed lock using atomic compare-and-delete (Lua script).
 * Only deletes the key if the stored value matches the caller's token.
 */
export async function releaseLock(
  key: string,
  token: string
): Promise<boolean> {
  if (!isRedisConfigured) {
    const entry = memoryCache.get(key);
    if (entry && entry.value === token) {
      memoryCache.delete(key);
      return true;
    }
    return false;
  }
  try {
    const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const res = await redis.eval(lua, [key], [token]);
    return res === 1;
  } catch (err) {
    console.warn(`[Redis Lock Warning] Failed to release lock "${key}":`, err);
    return false;
  }
}
