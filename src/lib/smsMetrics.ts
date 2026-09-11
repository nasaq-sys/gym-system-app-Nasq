/**
 * Ultra Gym — SMS Metrics
 *
 * Redis-based counter module for SMS operational metrics.
 * Uses the same Redis hash-incr pattern as metricsService.ts.
 *
 * - Daily counters (30-day TTL): sent, failed, skipped, D7 errors
 * - Sub-counters per event type: registration, renewal, expiration
 * - Operational status records per send attempt (lightweight, no message body/passwords)
 *
 * NEVER stores: message content, passwords, full phone numbers, API tokens.
 */

import { redis, isRedisConfigured } from "@/lib/redisClient";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SmsEventType = "registration" | "renewal" | "expiration" | "test";
export type SmsSkipReason = "invalid_phone" | "duplicate_prevented" | "disabled" | "send_in_progress" | "member_not_cached";
export type SmsStatus = "sent" | "failed" | "failed_permanent" | "skipped" | "pending";

export interface SmsStatusRecord {
  event: SmsEventType | string;
  status: SmsStatus | string;
  provider: "d7";
  memberId?: string;
  providerMessageId?: string;
  reason?: string;
  error?: string;
  timestamp?: string;
}

export interface SmsDailyMetrics {
  sentTotal: number;
  sentRegistration: number;
  sentRenewal: number;
  sentExpiration: number;
  sentTest: number;
  failedTotal: number;
  failedRegistration: number;
  failedRenewal: number;
  failedExpiration: number;
  skippedTotal: number;
  skippedInvalidPhone: number;
  skippedDuplicate: number;
  skippedDisabled: number;
  d7ApiErrors: number;
  estimatedSegments: number;
  estimatedCostUsd: number;
  date: string;
}

// ── Key Naming ────────────────────────────────────────────────────────────────

const DAILY_TTL = 30 * 24 * 3600; // 30 days

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-08-29"
}

function dailyHashKey(): string {
  return `ultra-gym:sms:metrics:daily:${dayBucket()}`;
}

// ── In-process fallback counters ──────────────────────────────────────────────

const mem: Record<string, number> = {};
function memIncr(key: string, n = 1) {
  mem[key] = (mem[key] ?? 0) + n;
}
function memGet(key: string): number {
  return mem[key] ?? 0;
}

// ── Internal incr helper ──────────────────────────────────────────────────────

async function hincr(hashKey: string, field: string, increment = 1): Promise<void> {
  if (!isRedisConfigured) {
    memIncr(`${hashKey}:${field}`, increment);
    return;
  }
  try {
    await redis.eval(
      `local c = redis.call("hincrby", KEYS[1], ARGV[1], ARGV[2])
       if c == tonumber(ARGV[2]) then
         redis.call("expire", KEYS[1], ARGV[3])
       end
       return c`,
      [hashKey],
      [field, increment, DAILY_TTL]
    );
  } catch {
    // Metric writes must never crash the application
  }
}

async function hgetAll(hashKey: string): Promise<Record<string, string>> {
  if (!isRedisConfigured) {
    const result: Record<string, string> = {};
    const prefix = `${hashKey}:`;
    for (const [k, v] of Object.entries(mem)) {
      if (k.startsWith(prefix)) result[k.slice(prefix.length)] = String(v);
    }
    return result;
  }
  try {
    const res = await redis.hgetall(hashKey);
    return (res as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

function numOf(rec: Record<string, string>, key: string): number {
  return parseInt(rec[key] ?? "0", 10) || 0;
}

// ── Public Counter Functions ──────────────────────────────────────────────────

export async function incrementSmsSent(type: SmsEventType): Promise<void> {
  const key = dailyHashKey();
  await Promise.allSettled([
    hincr(key, "sent_total"),
    hincr(key, `sent_${type}`),
    // Estimate segments: Arabic SMS = ~70 chars/segment, avg 120 chars = ~2 segments
    hincr(key, "estimated_segments", 2),
  ]);
}

export async function incrementSmsFailed(type: SmsEventType): Promise<void> {
  const key = dailyHashKey();
  await Promise.allSettled([
    hincr(key, "failed_total"),
    hincr(key, `failed_${type}`),
  ]);
}

export async function incrementSmsSkipped(reason: SmsSkipReason): Promise<void> {
  const key = dailyHashKey();
  await Promise.allSettled([
    hincr(key, "skipped_total"),
    hincr(key, `skipped_${reason}`),
  ]);
}

export async function incrementD7ApiError(): Promise<void> {
  await hincr(dailyHashKey(), "d7_api_errors");
}

/**
 * Records a lightweight operational status for a send attempt.
 * Does NOT store message body, passwords, or full phone numbers.
 */
export async function recordSmsStatus(record: SmsStatusRecord): Promise<void> {
  // Store a compact JSON record in a list capped at 200 entries
  // Key: ultra-gym:sms:recent-events (shared ring buffer)
  if (!isRedisConfigured) return;

  try {
    const entry = JSON.stringify({
      event: record.event,
      status: record.status,
      provider: record.provider,
      memberId: record.memberId ? record.memberId.slice(0, 10) + "..." : undefined,
      providerMessageId: record.providerMessageId,
      reason: record.reason,
      // Truncate error messages; never include passwords
      error: record.error ? record.error.slice(0, 100) : undefined,
      ts: new Date().toISOString(),
    });

    // Store in Redis sorted set by timestamp score for recent event log
    await redis.eval(
      `redis.call("zadd", KEYS[1], ARGV[1], ARGV[2])
       local count = redis.call("zcard", KEYS[1])
       if count > 200 then
         redis.call("zremrangebyrank", KEYS[1], 0, 0)
       end
       redis.call("expire", KEYS[1], ARGV[3])
       return 1`,
      ["ultra-gym:sms:recent-events"],
      [Date.now(), entry, DAILY_TTL]
    );
  } catch {
    // Non-critical — silently ignore
  }
}

// ── Public Metrics Reader ─────────────────────────────────────────────────────

/**
 * Returns SMS metrics for the current calendar day.
 * Reads from Redis only — zero Airtable reads.
 */
export async function getSmsMetrics(dateOverride?: string): Promise<SmsDailyMetrics> {
  const date = dateOverride ?? dayBucket();
  const hashKey = `ultra-gym:sms:metrics:daily:${date}`;
  const rec = await hgetAll(hashKey);

  const costPerSegment = parseFloat(process.env.D7_SMS_COST_PER_SEGMENT || "0.05");
  const estimatedSegments = numOf(rec, "estimated_segments");

  return {
    sentTotal: numOf(rec, "sent_total"),
    sentRegistration: numOf(rec, "sent_registration"),
    sentRenewal: numOf(rec, "sent_renewal"),
    sentExpiration: numOf(rec, "sent_expiration"),
    sentTest: numOf(rec, "sent_test"),
    failedTotal: numOf(rec, "failed_total"),
    failedRegistration: numOf(rec, "failed_registration"),
    failedRenewal: numOf(rec, "failed_renewal"),
    failedExpiration: numOf(rec, "failed_expiration"),
    skippedTotal: numOf(rec, "skipped_total"),
    skippedInvalidPhone: numOf(rec, "skipped_invalid_phone"),
    skippedDuplicate: numOf(rec, "skipped_duplicate_prevented"),
    skippedDisabled: numOf(rec, "skipped_disabled"),
    d7ApiErrors: numOf(rec, "d7_api_errors"),
    estimatedSegments,
    estimatedCostUsd: Math.round(estimatedSegments * costPerSegment * 100) / 100,
    date,
  };
}
