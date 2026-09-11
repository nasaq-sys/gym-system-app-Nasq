/**
 * Ultra Gym — Payment Operational Metrics
 *
 * Redis-based counter module for payment metrics using daily time-bucketed hashes.
 * Follows the same pattern as `metricsService.ts` and `smsMetrics.ts`.
 *
 * NEVER stores: card numbers, CVVs, customer payment details, API tokens.
 */

import { redis, isRedisConfigured } from "@/lib/redisClient";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PaymentDailyMetrics {
  provider: "myfatoorah" | "paytabs" | "mock";
  mode: "SANDBOX" | "TEST" | "DEMO" | "LIVE";
  paymentsCreated: number;
  paymentsSuccess: number;
  paymentsFailed: number;
  paymentsCancelled: number;
  duplicateCallbacksPrevented: number;
  renewalsFromOnlinePayment: number;
  totalVolumeJod: number;
  date: string;
}

// ── Key Naming ───────────────────────────────────────────────────────────────

const DAILY_TTL = 30 * 24 * 3600; // 30 days

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-08-29"
}

function dailyHashKey(): string {
  return `ultra-gym:payment:metrics:daily:${dayBucket()}`;
}

// ── In-process fallback counters ─────────────────────────────────────────────

const mem: Record<string, number> = {};
function memIncr(key: string, n = 1) {
  mem[key] = (mem[key] ?? 0) + n;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

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
    // Non-critical metric write
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

// ── Public Counter Increments ────────────────────────────────────────────────

export async function incrementPaymentCreated(): Promise<void> {
  await hincr(dailyHashKey(), "payments_created");
}

export async function incrementPaymentSuccess(amountJod: number): Promise<void> {
  const key = dailyHashKey();
  await Promise.allSettled([
    hincr(key, "payments_success"),
    hincr(key, "renewals_online"),
    hincr(key, "volume_cents", Math.round(amountJod * 100)),
  ]);
}

export async function incrementPaymentFailed(): Promise<void> {
  await hincr(dailyHashKey(), "payments_failed");
}

export async function incrementPaymentCancelled(): Promise<void> {
  await hincr(dailyHashKey(), "payments_cancelled");
}

export async function incrementDuplicateCallbackPrevented(): Promise<void> {
  await hincr(dailyHashKey(), "duplicate_callbacks_prevented");
}

// ── Public Metrics Reader ────────────────────────────────────────────────────

/**
 * Returns payment metrics for the current calendar day.
 * Reads from Redis only — ZERO Airtable reads.
 */
export async function getPaymentMetrics(dateOverride?: string): Promise<PaymentDailyMetrics> {
  const date = dateOverride ?? dayBucket();
  const hashKey = `ultra-gym:payment:metrics:daily:${date}`;
  const rec = await hgetAll(hashKey);

  const volumeCents = numOf(rec, "volume_cents");

  const rawProvider = (process.env.PAYMENT_PROVIDER || "myfatoorah").toLowerCase();
  const provider: "myfatoorah" | "paytabs" | "mock" =
    rawProvider === "paytabs" ? "paytabs" : rawProvider === "mock" ? "mock" : "myfatoorah";

  let mode: "SANDBOX" | "TEST" | "DEMO" | "LIVE" = "SANDBOX";
  if (provider === "mock" || process.env.PAYMENT_MODE === "demo") {
    mode = "DEMO";
  } else if (provider === "paytabs") {
    mode = process.env.PAYTABS_TEST_MODE !== "false" ? "TEST" : "LIVE";
  } else if (provider === "myfatoorah") {
    mode = process.env.MYFATOORAH_TEST_MODE !== "false" ? "SANDBOX" : "LIVE";
  }

  return {
    provider,
    mode,
    paymentsCreated: numOf(rec, "payments_created"),
    paymentsSuccess: numOf(rec, "payments_success"),
    paymentsFailed: numOf(rec, "payments_failed"),
    paymentsCancelled: numOf(rec, "payments_cancelled"),
    duplicateCallbacksPrevented: numOf(rec, "duplicate_callbacks_prevented"),
    renewalsFromOnlinePayment: numOf(rec, "renewals_online"),
    totalVolumeJod: Math.round((volumeCents / 100) * 100) / 100,
    date,
  };
}
