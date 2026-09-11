/**
 * System Health distributed rate limiter backed by Redis.
 *
 * Uses a single HINCRBY on a per-day bucket so multiple Lambda/serverless
 * instances share one global failure counter — no KEYS *, no SCAN.
 *
 * Key: ug:sh:rl:<adminId>:<ipHash>
 * TTL: windowMs (stored per-key)
 *
 * Designed so:
 *   - Only FAILED password attempts increment the counter.
 *   - Successful attempts do NOT consume attempts.
 *   - The counter is stored in Redis so it is shared across all instances.
 */
import { redis, isRedisConfigured } from "@/lib/redisClient";

const WINDOW_SECONDS = 10 * 60;   // 10 minutes
const MAX_FAILURES   = 10;        // 10 wrong attempts before lockout

// ── In-process fallback for local dev (no Redis) ──────────────────────────
const memBuckets = new Map<string, { count: number; resetAt: number }>();

export interface SHRateLimitResult {
  isLimited: boolean;
  remainingAttempts: number;
  resetInSeconds: number;
}

/**
 * Reads the current failure count WITHOUT incrementing it.
 * Used to pre-check before performing the password comparison.
 */
export async function checkSHRateLimit(bucketKey: string): Promise<SHRateLimitResult> {
  if (!isRedisConfigured) {
    const now = Date.now();
    const bucket = memBuckets.get(bucketKey);
    if (!bucket || now > bucket.resetAt) {
      return { isLimited: false, remainingAttempts: MAX_FAILURES, resetInSeconds: WINDOW_SECONDS };
    }
    const remaining = Math.max(0, MAX_FAILURES - bucket.count);
    const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      isLimited: bucket.count >= MAX_FAILURES,
      remainingAttempts: remaining,
      resetInSeconds,
    };
  }

  try {
    const [countRaw, ttlRaw] = await Promise.all([
      redis.hget(bucketKey, "count"),
      redis.ttl(bucketKey),
    ]);
    const count = parseInt(String(countRaw ?? "0"), 10) || 0;
    const ttlSecs = typeof ttlRaw === "number" && ttlRaw > 0 ? ttlRaw : 0;
    const isLimited = count >= MAX_FAILURES;
    return {
      isLimited,
      remainingAttempts: Math.max(0, MAX_FAILURES - count),
      resetInSeconds: ttlSecs,
    };
  } catch {
    // Redis failure → fail open (do not block legitimate admin)
    return { isLimited: false, remainingAttempts: MAX_FAILURES, resetInSeconds: WINDOW_SECONDS };
  }
}

/**
 * Records one failed password attempt. Increments the shared Redis counter
 * and sets the TTL on first write.
 * Returns the updated rate-limit state.
 */
export async function recordSHFailure(bucketKey: string): Promise<SHRateLimitResult> {
  if (!isRedisConfigured) {
    const now = Date.now();
    let bucket = memBuckets.get(bucketKey);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
      memBuckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, MAX_FAILURES - bucket.count);
    const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      isLimited: bucket.count >= MAX_FAILURES,
      remainingAttempts: remaining,
      resetInSeconds,
    };
  }

  try {
    // Lua: HINCRBY + set TTL only on first write (to keep the window consistent)
    const result = await redis.eval(
      `local c = redis.call("hincrby", KEYS[1], "count", 1)
       local ttl = redis.call("ttl", KEYS[1])
       if ttl < 0 then
         redis.call("expire", KEYS[1], ARGV[1])
       end
       return c`,
      [bucketKey],
      [WINDOW_SECONDS]
    ) as number;

    const count = typeof result === "number" ? result : 1;
    const ttlRaw = await redis.ttl(bucketKey);
    const ttlSecs = typeof ttlRaw === "number" && ttlRaw > 0 ? ttlRaw : WINDOW_SECONDS;

    return {
      isLimited: count >= MAX_FAILURES,
      remainingAttempts: Math.max(0, MAX_FAILURES - count),
      resetInSeconds: ttlSecs,
    };
  } catch {
    // Redis failure → do not block admin
    return { isLimited: false, remainingAttempts: MAX_FAILURES, resetInSeconds: WINDOW_SECONDS };
  }
}

/**
 * Builds the rate-limit bucket key.
 * Keyed by adminId so rate limits are per-admin, not per-IP (avoiding
 * shared-IP office blocking). IP is included as secondary dimension only.
 * We hash the IP to avoid storing PII in Redis keys.
 */
export function buildSHRateLimitKey(adminId: string, clientIp: string): string {
  // Simple stable hash of IP — not cryptographic, only for key distribution
  let h = 5381;
  for (let i = 0; i < clientIp.length; i++) {
    h = (Math.imul(h, 31) + clientIp.charCodeAt(i)) >>> 0;
  }
  const ipHash = h.toString(36);
  return `ug:sh:rl:${adminId}:${ipHash}`;
}
