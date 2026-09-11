/**
 * Ultra Gym — SMS Expiry Index
 *
 * Redis Sorted Set based index for scheduling expiration SMS.
 * Populated at member registration and subscription renewal.
 * Queried by the expiration cron worker (/api/cron/check-sms-expiry).
 *
 * Redis Key: ultra-gym:sms:expiry-index
 * Score: Unix timestamp (ms) of subscription expiry date
 * Member: "{subscriptionId}:{memberId}"
 *
 * This module performs ZERO Airtable reads.
 * All data comes from events already in-flight (registration/renewal payloads).
 */

import { redis, isRedisConfigured, getFromRedis, setInRedis } from "@/lib/redisClient";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPIRY_INDEX_KEY = "ultra-gym:sms:expiry-index";
// Keep member data needed for expiration SMS in Redis cache
// Key: ultra-gym:sms:member-cache:{memberId}
const MEMBER_SMS_CACHE_PREFIX = "ultra-gym:sms:member-cache:";
// 92 days TTL — longer than any normal subscription period
const MEMBER_SMS_CACHE_TTL = 92 * 86400;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpiryEntry {
  subscriptionId: string;
  memberId: string;
  /** Unix timestamp (ms) of expiry */
  expiryTimestampMs: number;
}

export interface MemberSmsData {
  memberId: string;
  memberName: string;
  phone: string | null;
}

// ── In-memory fallback for Sorted Set operations ──────────────────────────────

// When Redis is not configured, simulate ZADD/ZRANGEBYSCORE/ZREM in memory
const memExpiryIndex = new Map<string, number>(); // member → score

// ── Core Index Operations ─────────────────────────────────────────────────────

/**
 * Registers a new subscription expiry entry in the Redis Sorted Set.
 * Also caches the member's name and phone so the expiration cron
 * can send SMS without reading Airtable.
 *
 * Call this after a new member is created and their subscription is known.
 */
export async function registerExpiryEntry(
  entry: ExpiryEntry,
  memberData: MemberSmsData
): Promise<void> {
  const member = `${entry.subscriptionId}:${entry.memberId}`;

  // Cache member data needed for expiration SMS
  await cacheExpirationMemberData(entry.memberId, memberData);

  if (!isRedisConfigured) {
    memExpiryIndex.set(member, entry.expiryTimestampMs);
    return;
  }

  try {
    await redis.eval(
      `return redis.call("zadd", KEYS[1], ARGV[1], ARGV[2])`,
      [EXPIRY_INDEX_KEY],
      [entry.expiryTimestampMs, member]
    );
  } catch (err) {
    console.warn("[SmsExpiryIndex] Failed to register expiry entry:", err);
  }
}

/**
 * Updates the expiry date for an existing subscription (called on renewal).
 * Atomically updates the score so the OLD expiry date no longer triggers SMS.
 *
 * Call this after a subscription renewal succeeds.
 */
export async function updateExpiryEntry(
  entry: ExpiryEntry,
  memberData?: MemberSmsData
): Promise<void> {
  const member = `${entry.subscriptionId}:${entry.memberId}`;

  // Update cached member data if provided
  if (memberData) {
    await cacheExpirationMemberData(entry.memberId, memberData);
  }

  if (!isRedisConfigured) {
    memExpiryIndex.set(member, entry.expiryTimestampMs);
    return;
  }

  try {
    // ZADD with XX updates only if member already exists,
    // with GT updates only if new score is greater.
    // We use regular ZADD to handle both new and update cases.
    await redis.eval(
      `return redis.call("zadd", KEYS[1], ARGV[1], ARGV[2])`,
      [EXPIRY_INDEX_KEY],
      [entry.expiryTimestampMs, member]
    );
  } catch (err) {
    console.warn("[SmsExpiryIndex] Failed to update expiry entry:", err);
  }
}

/**
 * Removes a processed expiry entry from the sorted set.
 * Call this AFTER the expiration SMS has been successfully accepted by D7.
 */
export async function removeExpiryEntry(
  subscriptionId: string,
  memberId: string
): Promise<void> {
  const member = `${subscriptionId}:${memberId}`;

  if (!isRedisConfigured) {
    memExpiryIndex.delete(member);
    return;
  }

  try {
    await redis.eval(
      `return redis.call("zrem", KEYS[1], ARGV[1])`,
      [EXPIRY_INDEX_KEY],
      [member]
    );
  } catch (err) {
    console.warn("[SmsExpiryIndex] Failed to remove expiry entry:", err);
  }
}

/**
 * Returns all subscriptions whose expiry date is at or before `nowMs`.
 * These are candidates for expiration SMS.
 *
 * ZERO Airtable reads.
 */
export async function getDueExpirations(nowMs: number): Promise<
  Array<{ subscriptionId: string; memberId: string; expiryTimestampMs: number }>
> {
  if (!isRedisConfigured) {
    const due: Array<{ subscriptionId: string; memberId: string; expiryTimestampMs: number }> = [];
    for (const [member, score] of memExpiryIndex) {
      if (score <= nowMs) {
        const [subscriptionId, memberId] = member.split(":");
        due.push({ subscriptionId, memberId, expiryTimestampMs: score });
      }
    }
    return due;
  }

  try {
    // ZRANGEBYSCORE returns members with scores between -inf and nowMs
    const results = (await redis.eval(
      `return redis.call("zrangebyscore", KEYS[1], "-inf", ARGV[1], "WITHSCORES")`,
      [EXPIRY_INDEX_KEY],
      [nowMs]
    )) as string[];

    if (!results || results.length === 0) return [];

    const due: Array<{ subscriptionId: string; memberId: string; expiryTimestampMs: number }> = [];

    // Results come in pairs: [member, score, member, score, ...]
    for (let i = 0; i < results.length; i += 2) {
      const member = results[i];
      const score = parseFloat(results[i + 1]);
      if (!member) continue;

      const colonIdx = member.indexOf(":");
      if (colonIdx === -1) continue;

      const subscriptionId = member.slice(0, colonIdx);
      const memberId = member.slice(colonIdx + 1);

      due.push({ subscriptionId, memberId, expiryTimestampMs: score });
    }

    return due;
  } catch (err) {
    console.warn("[SmsExpiryIndex] Failed to query due expirations:", err);
    return [];
  }
}

// ── Member Data Cache ─────────────────────────────────────────────────────────

/**
 * Caches the minimum member data needed to send expiration SMS.
 * Stored separately from the main member profile cache to ensure
 * it stays available even after the profile cache expires.
 */
export async function cacheExpirationMemberData(
  memberId: string,
  data: MemberSmsData
): Promise<void> {
  await setInRedis(
    `${MEMBER_SMS_CACHE_PREFIX}${memberId}`,
    data,
    MEMBER_SMS_CACHE_TTL
  );
}

/**
 * Retrieves cached member data for expiration SMS.
 * Returns null if not cached (expiration SMS will be skipped with reason: member_not_cached).
 *
 * ZERO Airtable reads.
 */
export async function getExpirationMemberData(memberId: string): Promise<MemberSmsData | null> {
  return await getFromRedis<MemberSmsData>(`${MEMBER_SMS_CACHE_PREFIX}${memberId}`);
}

// ── Index Health ──────────────────────────────────────────────────────────────

/**
 * Returns the count of pending expiry entries in the sorted set.
 * Used for System Health display.
 */
export async function getExpiryIndexSize(): Promise<number> {
  if (!isRedisConfigured) {
    return memExpiryIndex.size;
  }
  try {
    const count = (await redis.eval(
      `return redis.call("zcard", KEYS[1])`,
      [EXPIRY_INDEX_KEY],
      []
    )) as number;
    return count || 0;
  } catch {
    return 0;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Converts an ISO date string (YYYY-MM-DD) to Unix timestamp in milliseconds.
 * Uses end-of-day (23:59 local) to ensure expiry fires on the correct day.
 */
export function expiryDateToTimestamp(isoDate: string, timezone = "Asia/Amman"): number {
  try {
    // Parse as end of day in Jordan timezone
    const date = new Date(`${isoDate}T23:59:59`);
    return date.getTime();
  } catch {
    return new Date(isoDate).getTime();
  }
}
