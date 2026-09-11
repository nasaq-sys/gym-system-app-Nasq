/**
 * Ultra Gym Metrics Service
 *
 * Stores operational counters in time-bucketed Redis keys using INCR/HINCRBY.
 * Retains hourly buckets for 7 days, daily buckets for 30 days.
 * NEVER reads or writes Airtable. NEVER uses KEYS * or broad SCAN.
 */
import { redis, isRedisConfigured } from "@/lib/redisClient";
import { getSmsMetrics, type SmsDailyMetrics } from "@/lib/smsMetrics";
import { getExpiryIndexSize } from "@/lib/smsExpiryIndex";
import { getPaymentMetrics, type PaymentDailyMetrics } from "@/lib/paymentMetrics";

// ── Canonical Resource IDs ──────────────────────────────────────────────────

export const CANONICAL_RESOURCES = [
  "subscriptions",
  "attendance",
  "members",
  "events",
  "classes",
  "workouts",
  "trainer",
  "admin_members",
  "admin_overview",
  "store",
  "cafe",
  "nutrition",
  "notifications",
  "inbody",
  "facilities",
  "lost_found",
  "equipment",
  "accounting",
  "staff",
  "chat_faq",
  "meal_calculator",
  "live_count",
  "auth",
  "unclassified",
] as const;

export type MetricResource = typeof CANONICAL_RESOURCES[number];

// ── Types ──────────────────────────────────────────────────────────────────

export interface SystemMetrics {
  airtableReads: number;
  airtableWrites: number;
  airtable429Errors: number;
  airtableRetries: number;
  redisFreshHits: number;
  redisStaleHits: number;
  redisMisses: number;
  redisNegativeHits: number;
  redisErrors: number;
  totalLookups: number;
  cacheHitRate: number;
  airtableCallsAvoided: number;

  // Diagnostics & Consistency Reconciliation
  reconciliation: {
    globalFresh: number;
    categorizedFresh: number;
    unclassifiedFresh: number;
    globalStale: number;
    categorizedStale: number;
    unclassifiedStale: number;
    globalMiss: number;
    categorizedMiss: number;
    unclassifiedMiss: number;
    globalAirtableReads: number;
    categorizedAirtableReads: number;
    unclassifiedAirtableReads: number;
    isAirtableReconciled: boolean;
    isCacheReconciled: boolean;
  };

  // Distributed lock
  missLockAcquired: number;
  missLockContended: number;
  missWaitResolvedFromRedis: number;
  missLockExpired: number;
  singleFlightSaved: number;
  stampedeRefreshesAvoided: number;
  // Push polling
  pushPollRedisReads: number;
  pushPollAirtableReads: number;
  // Per-route reads (top consumers) - clean logical sources
  routeReads: Record<string, number>;
  // Cache efficiency by resource
  resourceMetrics: Record<string, ResourceMetric>;
  // System health & cache status
  status: "healthy" | "warning" | "critical" | "warming_up";
  cacheEfficiencyLevel: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "WARNING" | "CRITICAL" | "WARMING_UP";
  statusReasons: string[];
  generatedAt: number;
  // SMS channel metrics
  smsMetrics: SmsDailyMetrics;
  smsExpiryIndexSize: number;
  // Payment metrics
  paymentMetrics: PaymentDailyMetrics;
}

export interface ResourceMetric {
  freshHits: number;
  staleHits: number;
  misses: number;
  negativeHits: number;
  airtableReads: number;
  totalLookups: number;
  hitRate: number | null; // null if totalLookups === 0 (no data)
  status: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "NEEDS_ATTENTION" | "POOR" | "NO_DATA";
  isOptimizationOpportunity: boolean;
}

// ── Key Naming ─────────────────────────────────────────────────────────────

function dayBucket(): string {
  return new Date().toISOString().slice(0, 10); // e.g. "2026-08-24"
}

function hourBucket(): string {
  const d = new Date();
  return d.toISOString().slice(0, 13); // e.g. "2026-08-24T06"
}

const HOURLY_TTL = 7 * 24 * 3600;   // 7 days
const DAILY_TTL  = 30 * 24 * 3600;  // 30 days

// ── In-process fallback counters (when Redis is absent) ───────────────────

const mem: Record<string, number> = {};
function memIncr(field: string, n = 1) {
  mem[field] = (mem[field] ?? 0) + n;
}

// ── Internal increment helpers ─────────────────────────────────────────────

async function hincr(hashKey: string, field: string, increment = 1, ttl: number): Promise<void> {
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
      [field, increment, ttl]
    );
  } catch {
    // Silently ignore metric write failure — monitoring must never break the app
  }
}

async function hincrMulti(
  items: Array<{ key: string; field: string; increment?: number; ttl: number }>
): Promise<void> {
  if (!isRedisConfigured) {
    for (const item of items) {
      memIncr(`${item.key}:${item.field}`, item.increment ?? 1);
    }
    return;
  }
  try {
    // Concurrently batch multiple counters in one operation without blocking
    await Promise.all(
      items.map((item) =>
        redis.eval(
          `local c = redis.call("hincrby", KEYS[1], ARGV[1], ARGV[2])
           if c == tonumber(ARGV[2]) then
             redis.call("expire", KEYS[1], ARGV[3])
           end
           return c`,
          [item.key],
          [item.field, item.increment ?? 1, item.ttl]
        )
      )
    );
  } catch {
    // Silently ignore metric write failure
  }
}

async function hgetAll(hashKey: string): Promise<Record<string, string>> {
  if (!isRedisConfigured) {
    const result: Record<string, string> = {};
    const prefix = hashKey + ":";
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

// ── Safe Source Sanitization (No Raw URLs, Record IDs, Base IDs, or Query Strings) ────

export function mapTableToLogicalSource(tableOrSource: string): MetricResource {
  if (!tableOrSource) return "unclassified";
  const clean = tableOrSource.trim().toLowerCase();

  // If already a canonical resource
  if (CANONICAL_RESOURCES.includes(clean as MetricResource)) {
    return clean as MetricResource;
  }

  // Exact or keyword match
  if (clean.includes("اشتراك") || clean.includes("تجميد") || clean.includes("subscript") || clean.includes("freeze")) return "subscriptions";
  if (clean.includes("حضور") || clean.includes("attend")) return "attendance";
  if (clean.includes("inbody") || clean.includes("scan") || clean.includes("stat")) return "inbody";
  if (clean.includes("live") || clean.includes("عداد")) return "live_count";
  if (clean.includes("admin_member") || clean.includes("إدارة المتدربين")) return "admin_members";
  if (clean.includes("متدرب") || clean.includes("member")) return "members";
  if (clean.includes("كلاس") || clean.includes("class")) return "classes";
  if (clean.includes("فعال") || clean.includes("event")) return "events";
  if (clean.includes("تمرين") || clean.includes("تمارين") || clean.includes("workout") || clean.includes("exercise") || clean.includes("weight_log")) return "workouts";
  if (clean.includes("متجر") || clean.includes("store") || clean.includes("منتج")) return "store";
  if (clean.includes("كافيه") || clean.includes("cafe") || clean.includes("طعام")) return "cafe";
  if (clean.includes("حاسب") || clean.includes("calculator")) return "meal_calculator";
  if (clean.includes("تغذية") || clean.includes("وجب") || clean.includes("nutrition") || clean.includes("food") || clean.includes("meal")) return "nutrition";
  if (clean.includes("اشعار") || clean.includes("إشعار") || clean.includes("notif")) return "notifications";
  if (clean.includes("مرافق") || clean.includes("مرفق") || clean.includes("facility") || clean.includes("booking")) return "facilities";
  if (clean.includes("مفقود") || clean.includes("معثور") || clean.includes("lost")) return "lost_found";
  if (clean.includes("الات") || clean.includes("آلات") || clean.includes("معدات") || clean.includes("صيانة") || clean.includes("equipment") || clean.includes("maintenance")) return "equipment";
  if (clean.includes("حساب") || clean.includes("حركات") || clean.includes("فواتير") || clean.includes("محاسب") || clean.includes("accounting") || clean.includes("transaction") || clean.includes("cash")) return "accounting";
  if (clean.includes("trainer_trainee") || clean.includes("trainee")) return "trainer";
  if (clean.includes("موظف") || clean.includes("مدرب") || clean.includes("staff") || clean.includes("trainer")) return "staff";
  if (clean.includes("faq") || clean.includes("chat") || clean.includes("أسئلة")) return "chat_faq";
  if (clean.includes("overview")) return "admin_overview";
  if (clean.includes("auth") || clean.includes("login") || clean.includes("user_auth") || clean.includes("session") || clean.includes("system_health_unlock")) return "auth";

  // Prevent any raw Airtable record IDs or tokens from leaking
  if (clean.startsWith("rec") || clean.startsWith("app") || clean.startsWith("tbl")) {
    return "unclassified";
  }

  return "unclassified";
}

export function sanitizeMetricSource(raw: string): MetricResource {
  if (!raw) return "unclassified";
  // If raw string contains a URL (e.g. legacy data), extract table name only
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.includes("api.airtable.com")) {
    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);
      const lastPart = decodeURIComponent(parts[parts.length - 1] ?? "");
      return mapTableToLogicalSource(lastPart);
    } catch {
      return "unclassified";
    }
  }
  return mapTableToLogicalSource(raw);
}

// ── Public recording API ────────────────────────────────────────────────────

export const metrics = {
  async recordAirtableRead(tableNameOrSource?: string, count: number = 1) {
    const day = dayBucket();
    const safeSource = sanitizeMetricSource(tableNameOrSource || "");
    const items = [
      { key: `ug:m:${day}:at`, field: "reads", increment: count, ttl: DAILY_TTL },
      { key: `ug:m:${day}:routes`, field: safeSource, increment: count, ttl: DAILY_TTL },
      { key: `ug:m:${day}:res:${safeSource}`, field: "at", increment: count, ttl: DAILY_TTL },
    ];
    await hincrMulti(items);
  },
  async recordAirtableWrite() {
    await hincr(`ug:m:${dayBucket()}:at`, "writes", 1, DAILY_TTL);
  },
  async recordAirtable429() {
    await hincr(`ug:m:${dayBucket()}:at`, "err429", 1, DAILY_TTL);
  },
  async recordAirtableRetry() {
    await hincr(`ug:m:${dayBucket()}:at`, "retries", 1, DAILY_TTL);
  },

  async recordRedisFreshHit(resource?: string) {
    const safeRes = resource ? mapTableToLogicalSource(resource) : "unclassified";
    const items = [
      { key: `ug:m:${hourBucket()}:redis`, field: "fresh", increment: 1, ttl: HOURLY_TTL },
      { key: `ug:m:${dayBucket()}:res:${safeRes}`, field: "fresh", increment: 1, ttl: DAILY_TTL },
    ];
    await hincrMulti(items);
  },
  async recordRedisStaleHit(resource?: string) {
    const safeRes = resource ? mapTableToLogicalSource(resource) : "unclassified";
    const items = [
      { key: `ug:m:${hourBucket()}:redis`, field: "stale", increment: 1, ttl: HOURLY_TTL },
      { key: `ug:m:${dayBucket()}:res:${safeRes}`, field: "stale", increment: 1, ttl: DAILY_TTL },
    ];
    await hincrMulti(items);
  },
  async recordRedisMiss(resource?: string) {
    const safeRes = resource ? mapTableToLogicalSource(resource) : "unclassified";
    const items = [
      { key: `ug:m:${hourBucket()}:redis`, field: "miss", increment: 1, ttl: HOURLY_TTL },
      { key: `ug:m:${dayBucket()}:res:${safeRes}`, field: "miss", increment: 1, ttl: DAILY_TTL },
    ];
    await hincrMulti(items);
  },
  async recordRedisNegativeHit(resource?: string) {
    const safeRes = resource ? mapTableToLogicalSource(resource) : "unclassified";
    const items = [
      { key: `ug:m:${hourBucket()}:redis`, field: "negative", increment: 1, ttl: HOURLY_TTL },
      { key: `ug:m:${dayBucket()}:res:${safeRes}`, field: "negative", increment: 1, ttl: DAILY_TTL },
    ];
    await hincrMulti(items);
  },
  async recordRedisError() {
    await hincr(`ug:m:${dayBucket()}:at`, "redisErrors", 1, DAILY_TTL);
  },
  async recordCallsAvoided(n = 1) {
    await hincr(`ug:m:${dayBucket()}:at`, "avoided", n, DAILY_TTL);
  },

  async recordLockAcquired()    { await hincr(`ug:m:${dayBucket()}:lock`, "acquired", 1, DAILY_TTL); },
  async recordLockContended()   { await hincr(`ug:m:${dayBucket()}:lock`, "contended", 1, DAILY_TTL); },
  async recordLockWaitResolved(){ await hincr(`ug:m:${dayBucket()}:lock`, "waitResolved", 1, DAILY_TTL); },
  async recordLockExpired()     { await hincr(`ug:m:${dayBucket()}:lock`, "expired", 1, DAILY_TTL); },
  async recordSingleFlight(n = 1) { await hincr(`ug:m:${dayBucket()}:lock`, "singleFlight", n, DAILY_TTL); },
  async recordStampede(n = 1)   { await hincr(`ug:m:${dayBucket()}:lock`, "stampede", n, DAILY_TTL); },

  async recordPushPollRedis()    { await hincr(`ug:m:${dayBucket()}:push`, "redisReads", 1, DAILY_TTL); },
  async recordPushPollAirtable() { await hincr(`ug:m:${dayBucket()}:push`, "atReads", 1, DAILY_TTL); },

  async recordSecurityEvent(event: string, adminId: string) {
    if (!isRedisConfigured) return;
    const key = `ug:m:security:${dayBucket()}`;
    const entry = JSON.stringify({ ts: Date.now(), event, adminId });
    try {
      await redis.eval(
        `redis.call("lpush", KEYS[1], ARGV[1])
         redis.call("ltrim", KEYS[1], 0, 199)
         redis.call("expire", KEYS[1], ARGV[2])
         return 1`,
        [key],
        [entry, DAILY_TTL]
      );
    } catch { /* ignore */ }
  },
};

// ── Aggregation: Read from Redis only (zero Airtable calls) ─────────────────

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const day = dayBucket();
  const hr  = hourBucket();

  const baseKeys = [
    `ug:m:${day}:at`,
    `ug:m:${hr}:redis`,
    `ug:m:${day}:lock`,
    `ug:m:${day}:push`,
    `ug:m:${day}:routes`,
  ];
  const resourceKeys = CANONICAL_RESOURCES.map((r) => `ug:m:${day}:res:${r}`);

  const allRaw = await Promise.all([...baseKeys, ...resourceKeys].map(hgetAll));
  const [atRaw, redisRaw, lockRaw, pushRaw, routesRaw, ...resourceRaws] = allRaw;

  const airtableReads   = numOf(atRaw, "reads");
  const airtableWrites  = numOf(atRaw, "writes");
  const airtable429     = numOf(atRaw, "err429");
  const airtableRetries = numOf(atRaw, "retries");
  const redisErrors     = numOf(atRaw, "redisErrors");
  const avoided         = numOf(atRaw, "avoided");

  const freshHits    = numOf(redisRaw, "fresh");
  const staleHits    = numOf(redisRaw, "stale");
  const misses       = numOf(redisRaw, "miss");
  const negativeHits = numOf(redisRaw, "negative");

  const totalLookups = freshHits + staleHits + misses + negativeHits;
  const hitRate = totalLookups > 0
    ? ((freshHits + staleHits + negativeHits) / totalLookups) * 100
    : 0;

  // Sanitize and aggregate routes so NO raw URLs, base IDs, or query strings are exposed
  const routeReads: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(routesRaw)) {
    const count = parseInt(rawVal, 10) || 0;
    if (count <= 0) continue;
    const safeSource = sanitizeMetricSource(rawKey);
    routeReads[safeSource] = (routeReads[safeSource] ?? 0) + count;
  }

  const resourceMetrics: Record<string, ResourceMetric> = {};
  let categorizedFresh = 0;
  let categorizedStale = 0;
  let categorizedMiss = 0;
  let categorizedAt = 0;

  CANONICAL_RESOURCES.forEach((res, idx) => {
    const rRaw = resourceRaws[idx];
    const f = numOf(rRaw, "fresh");
    const s = numOf(rRaw, "stale");
    const m = numOf(rRaw, "miss");
    const neg = numOf(rRaw, "negative");
    const at = numOf(rRaw, "at");

    const resHits = f + s + neg;
    const resTotal = resHits + m;
    const resHitRate = resTotal > 0 ? (resHits / resTotal) * 100 : null;

    let resStatus: ResourceMetric["status"] = "NO_DATA";
    if (resTotal > 0 && resHitRate !== null) {
      if (resHitRate >= 95) resStatus = "EXCELLENT";
      else if (resHitRate >= 90) resStatus = "VERY_GOOD";
      else if (resHitRate >= 80) resStatus = "GOOD";
      else if (resHitRate >= 70) resStatus = "NEEDS_ATTENTION";
      else resStatus = "POOR";
    }

    // Optimization opportunity: high Airtable reads with suboptimal hit rate
    const isOptimizationOpportunity = at >= 10 && (resHitRate === null || resHitRate < 80);

    resourceMetrics[res] = {
      freshHits: f,
      staleHits: s,
      misses: m,
      negativeHits: neg,
      airtableReads: at,
      totalLookups: resTotal,
      hitRate: resHitRate !== null ? Math.round(resHitRate * 10) / 10 : null,
      status: resStatus,
      isOptimizationOpportunity,
    };

    if (res !== "unclassified") {
      categorizedFresh += f;
      categorizedStale += s;
      categorizedMiss += m;
      categorizedAt += at;
    }
  });

  const unclassifiedFresh = resourceMetrics["unclassified"]?.freshHits || 0;
  const unclassifiedStale = resourceMetrics["unclassified"]?.staleHits || 0;
  const unclassifiedMiss = resourceMetrics["unclassified"]?.misses || 0;
  const unclassifiedAt = resourceMetrics["unclassified"]?.airtableReads || 0;

  const reconciliation = {
    globalFresh: freshHits,
    categorizedFresh,
    unclassifiedFresh,
    globalStale: staleHits,
    categorizedStale,
    unclassifiedStale,
    globalMiss: misses,
    categorizedMiss,
    unclassifiedMiss,
    globalAirtableReads: airtableReads,
    categorizedAirtableReads: categorizedAt,
    unclassifiedAirtableReads: unclassifiedAt,
    isAirtableReconciled: (categorizedAt + unclassifiedAt) === airtableReads,
    isCacheReconciled: (categorizedFresh + unclassifiedFresh) <= (freshHits + 50), // Tolerance across bucket windows
  };

  const statusReasons: string[] = [];
  let status: "healthy" | "warning" | "critical" | "warming_up" = "healthy";
  let cacheEfficiencyLevel: SystemMetrics["cacheEfficiencyLevel"] = "WARMING_UP";

  const pushAtReads = numOf(pushRaw, "atReads");
  const lockExpirations = numOf(lockRaw, "expired");

  const MIN_SAMPLE_THRESHOLD = 50;

  // Cache Efficiency Level
  if (totalLookups < MIN_SAMPLE_THRESHOLD) {
    cacheEfficiencyLevel = "WARMING_UP";
  } else if (hitRate >= 95) {
    cacheEfficiencyLevel = "EXCELLENT";
  } else if (hitRate >= 90) {
    cacheEfficiencyLevel = "VERY_GOOD";
  } else if (hitRate >= 80) {
    cacheEfficiencyLevel = "GOOD";
  } else if (hitRate >= 70) {
    cacheEfficiencyLevel = "WARNING";
  } else {
    cacheEfficiencyLevel = "CRITICAL";
  }

  // Multi-signal overall health assessment
  if (airtable429 > 0) {
    status = "critical";
    statusReasons.push(`Airtable 429 rate-limit errors: ${airtable429}`);
  }
  if (redisErrors > 5) {
    status = "critical";
    statusReasons.push(`Redis server errors: ${redisErrors}`);
  }
  if (pushAtReads > 0) {
    status = "critical";
    statusReasons.push(`Push polling hit Airtable: ${pushAtReads} times`);
  }

  if (status !== "critical") {
    if (totalLookups < MIN_SAMPLE_THRESHOLD) {
      status = "warming_up";
      statusReasons.push("Collecting initial traffic sample to calculate a reliable cache efficiency score.");
    } else if (hitRate < 70) {
      status = "critical";
      statusReasons.push(`Cache hit rate critically low: ${hitRate.toFixed(1)}%`);
    } else if (hitRate < 85 || lockExpirations > 5 || (redisErrors > 0 && redisErrors <= 5)) {
      status = "warning";
      if (hitRate < 85) statusReasons.push(`Cache hit rate below target: ${hitRate.toFixed(1)}%`);
      if (lockExpirations > 5) statusReasons.push(`Distributed lock expirations: ${lockExpirations}`);
      if (redisErrors > 0) statusReasons.push(`Redis transient errors: ${redisErrors}`);
    } else {
      // >= 85% is Healthy
      status = "healthy";
      if (hitRate >= 95) {
        statusReasons.push("All cache clusters and API metrics operating at peak efficiency");
      } else {
        statusReasons.push(`Cache efficiency is very good (${hitRate.toFixed(1)}%) — close to optimal 95% target`);
      }
    }
  }

  if (statusReasons.length === 0) {
    statusReasons.push("All systems operating normally");
  }

  // ── Parallel non-blocking metrics fetch ──────────────────────────────────
  const [smsMetrics, smsExpiryIndexSize, paymentMetrics] = await Promise.all([
    getSmsMetrics().catch(() => ({
      sentTotal: 0, sentRegistration: 0, sentRenewal: 0, sentExpiration: 0, sentTest: 0,
      failedTotal: 0, failedRegistration: 0, failedRenewal: 0, failedExpiration: 0,
      skippedTotal: 0, skippedInvalidPhone: 0, skippedDuplicate: 0, skippedDisabled: 0,
      d7ApiErrors: 0, estimatedSegments: 0, estimatedCostUsd: 0,
      date: new Date().toISOString().slice(0, 10),
    })),
    getExpiryIndexSize().catch(() => 0),
    getPaymentMetrics().catch(() => ({
      provider: "myfatoorah" as const,
      mode: "SANDBOX" as const,
      paymentsCreated: 0,
      paymentsSuccess: 0,
      paymentsFailed: 0,
      paymentsCancelled: 0,
      duplicateCallbacksPrevented: 0,
      renewalsFromOnlinePayment: 0,
      totalVolumeJod: 0,
      date: new Date().toISOString().slice(0, 10),
    })),
  ]);

  return {
    airtableReads,
    airtableWrites,
    airtable429Errors: airtable429,
    airtableRetries,
    redisFreshHits: freshHits,
    redisStaleHits: staleHits,
    redisMisses: misses,
    redisNegativeHits: negativeHits,
    redisErrors,
    totalLookups,
    cacheHitRate: Math.round(hitRate * 10) / 10,
    airtableCallsAvoided: avoided,
    reconciliation,
    missLockAcquired: numOf(lockRaw, "acquired"),
    missLockContended: numOf(lockRaw, "contended"),
    missWaitResolvedFromRedis: numOf(lockRaw, "waitResolved"),
    missLockExpired: lockExpirations,
    singleFlightSaved: numOf(lockRaw, "singleFlight"),
    stampedeRefreshesAvoided: numOf(lockRaw, "stampede"),
    pushPollRedisReads: numOf(pushRaw, "redisReads"),
    pushPollAirtableReads: pushAtReads,
    routeReads,
    resourceMetrics,
    status,
    cacheEfficiencyLevel,
    statusReasons,
    generatedAt: Date.now(),
    smsMetrics,
    smsExpiryIndexSize,
    paymentMetrics,
  };
}
