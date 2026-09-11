/**
 * Unit & Integration Test Suite for System Health Per-Resource Metrics,
 * Canonical Resource ID Taxonomy, and Consistency Reconciliation.
 */
import {
  metrics,
  getSystemMetrics,
  mapTableToLogicalSource,
  sanitizeMetricSource,
  CANONICAL_RESOURCES,
} from "@/lib/metricsService";
import { deriveResourceFromKey, withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
}

export async function runSystemHealthResourceMetricsTests(): Promise<void> {
  // 1. Canonical Resource Taxonomy & Mapping
  const set = new Set(CANONICAL_RESOURCES);
  assert(set.size === CANONICAL_RESOURCES.length, "All canonical resources are unique");
  assert(set.has("subscriptions"), "Contains subscriptions");
  assert(set.has("attendance"), "Contains attendance");
  assert(set.has("members"), "Contains members");
  assert(set.has("events"), "Contains events");
  assert(set.has("classes"), "Contains classes");
  assert(set.has("workouts"), "Contains workouts");
  assert(set.has("store"), "Contains store");
  assert(set.has("cafe"), "Contains cafe");
  assert(set.has("nutrition"), "Contains nutrition");
  assert(set.has("unclassified"), "Contains unclassified");

  assert(mapTableToLogicalSource("اشتراكات") === "subscriptions", "Maps 'اشتراكات'");
  assert(mapTableToLogicalSource("تجميد") === "subscriptions", "Maps 'تجميد'");
  assert(mapTableToLogicalSource("tblSubscriptions") === "subscriptions", "Maps 'tblSubscriptions'");
  assert(mapTableToLogicalSource("سجل الحضور") === "attendance", "Maps 'سجل الحضور'");
  assert(mapTableToLogicalSource("Attendance") === "attendance", "Maps 'Attendance'");
  assert(mapTableToLogicalSource("InBody Scans") === "inbody", "Maps 'InBody Scans'");
  assert(mapTableToLogicalSource("المتجر") === "store", "Maps 'المتجر'");
  assert(mapTableToLogicalSource("كافيه") === "cafe", "Maps 'كافيه'");
  assert(mapTableToLogicalSource("التمارين") === "workouts", "Maps 'التمارين'");
  assert(mapTableToLogicalSource("الفعاليات") === "events", "Maps 'الفعاليات'");
  assert(mapTableToLogicalSource("حاسبة الوجبات") === "meal_calculator", "Maps 'حاسبة الوجبات'");
  assert(mapTableToLogicalSource("العداد المباشر") === "live_count", "Maps 'العداد المباشر'");

  assert(
    sanitizeMetricSource("https://api.airtable.com/v0/app123/tblSubscriptions?maxRecords=100") === "subscriptions",
    "Strips URL params"
  );
  assert(sanitizeMetricSource("rec98234798234") === "unclassified", "Anonymizes record ID");
  assert(sanitizeMetricSource("appABCDEF123456") === "unclassified", "Anonymizes base ID");
  assert(sanitizeMetricSource("") === "unclassified", "Handles empty input");

  assert(deriveResourceFromKey(REDIS_KEYS.ATTENDANCE_MONTH("2026-08")) === "attendance", "Derives attendance");
  assert(deriveResourceFromKey(REDIS_KEYS.MEMBER_PROFILE("rec123")) === "members", "Derives members");
  assert(deriveResourceFromKey(REDIS_KEYS.MEMBER_STATS("rec123")) === "inbody", "Derives inbody");
  assert(deriveResourceFromKey(REDIS_KEYS.MEMBER_WORKOUTS("rec123")) === "workouts", "Derives workouts");
  assert(deriveResourceFromKey(REDIS_KEYS.EVENTS_PAGE) === "events", "Derives events");
  assert(deriveResourceFromKey(REDIS_KEYS.STORE_PRODUCTS) === "store", "Derives store");
  assert(deriveResourceFromKey(REDIS_KEYS.CAFE_MENU) === "cafe", "Derives cafe");
  assert(deriveResourceFromKey(REDIS_KEYS.CHAT_FAQ) === "chat_faq", "Derives chat_faq");
  assert(deriveResourceFromKey(REDIS_KEYS.GYM_COUNT) === "live_count", "Derives live_count");
  assert(deriveResourceFromKey(REDIS_KEYS.ADMIN_OVERVIEW) === "admin_overview", "Derives admin_overview");

  // 2. Metric Recording and Consistency Reconciliation
  await metrics.recordRedisFreshHit("attendance");
  await metrics.recordRedisFreshHit("attendance");
  await metrics.recordRedisStaleHit("attendance");
  await metrics.recordRedisMiss("attendance");
  await metrics.recordAirtableRead("attendance", 1);

  await metrics.recordRedisFreshHit("subscriptions");
  await metrics.recordRedisFreshHit("subscriptions");
  await metrics.recordRedisFreshHit("subscriptions");
  await metrics.recordAirtableRead("subscriptions", 2);

  await metrics.recordRedisFreshHit("store");
  await metrics.recordRedisMiss("store");

  const sys = await getSystemMetrics();
  const att = sys.resourceMetrics["attendance"];
  assert(att !== undefined, "Attendance exists");
  assert(att.freshHits >= 2, "Attendance fresh hits >= 2");
  assert(att.staleHits >= 1, "Attendance stale hits >= 1");
  assert(att.misses >= 1, "Attendance misses >= 1");
  assert(att.airtableReads >= 1, "Attendance Airtable reads >= 1");
  assert(att.totalLookups === att.freshHits + att.staleHits + att.misses + att.negativeHits, "Total lookups match sum");
  assert(att.hitRate !== null && att.hitRate > 0, "Hit rate computed");

  const subs = sys.resourceMetrics["subscriptions"];
  assert(subs !== undefined, "Subscriptions exists");
  assert(subs.freshHits >= 3, "Subscriptions fresh hits >= 3");
  assert(subs.airtableReads >= 2, "Subscriptions Airtable reads >= 2");

  const fac = sys.resourceMetrics["facilities"];
  if (fac.totalLookups === 0) {
    assert(fac.hitRate === null, "Empty resource hitRate is null");
    assert(fac.status === "NO_DATA", "Empty resource status is NO_DATA");
  }

  let totalCategorizedReads = 0;
  for (const [, rm] of Object.entries(sys.resourceMetrics)) {
    totalCategorizedReads += rm.airtableReads;
  }
  assert(totalCategorizedReads === sys.airtableReads, "Categorized reads sum equals global reads");
  assert(sys.reconciliation.isAirtableReconciled === true, "Airtable consistency reconciled");

  // 3. Health Assessment & Hit Rate Tier Classification
  for (let i = 0; i < 94; i++) {
    await metrics.recordRedisFreshHit("members");
  }
  for (let i = 0; i < 6; i++) {
    await metrics.recordRedisMiss("members");
  }

  const sys2 = await getSystemMetrics();
  assert(sys2.totalLookups >= 50, "Sample size >= 50");
  assert(sys2.cacheHitRate >= 90, "Hit rate >= 90%");
  assert(sys2.status === "healthy", "94.7% hit rate evaluates to healthy");
  assert(
    sys2.cacheEfficiencyLevel === "VERY_GOOD" || sys2.cacheEfficiencyLevel === "EXCELLENT",
    "Efficiency level is VERY_GOOD or EXCELLENT"
  );

  // 4. withCacheSWR Warm Redis Serves with 0 Airtable Reads
  const testKey = "ultra-gym:test:resource:warm:ts";
  let airtableFetcherCalled = 0;
  const fetcher = async () => {
    airtableFetcherCalled++;
    return { message: "fresh from airtable" };
  };

  const res1 = await withCacheSWR(testKey, fetcher, {
    ttlSeconds: 300,
    softTtlSeconds: 60,
    resource: "subscriptions",
    logTag: "test:subscriptions",
  });
  assert(res1.source === "airtable_fresh", "1st call source is airtable_fresh");
  assert(airtableFetcherCalled === 1, "Fetcher called once on miss");

  const res2 = await withCacheSWR(testKey, fetcher, {
    ttlSeconds: 300,
    softTtlSeconds: 60,
    resource: "subscriptions",
    logTag: "test:subscriptions",
  });
  assert(res2.source === "redis_hit", "2nd call source is redis_hit");
  assert(res2.isStale === false, "2nd call is not stale");
  assert(airtableFetcherCalled === 1, "Zero additional fetcher calls on warm request");
}

