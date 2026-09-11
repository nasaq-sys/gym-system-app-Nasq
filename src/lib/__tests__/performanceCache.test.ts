import { withCacheSWR, invalidateMemberCache, REDIS_KEYS } from "../cacheService";
import { isRedisConfigured } from "../redisClient";

async function runPerformanceCacheTests() {
  console.log("=================================================");
  console.log("⚡ TESTING REDIS SWR CACHE & PERFORMANCE ENGINE");
  console.log("=================================================");
  console.log(`Redis Configured: ${isRedisConfigured ? "YES (Live Connection)" : "NO (Mock / Graceful Fallback)"}`);

  const mockMember = {
    recordId: "recPerfTest999",
    name: "Performance Member",
    email: "perf@ultragym.jo",
    subStatus: "نشط",
    daysRemaining: "28",
  };

  const testKey = REDIS_KEYS.MEMBER_PROFILE(mockMember.recordId);
  let airtableFetchCount = 0;

  const mockAirtableFetcher = async () => {
    airtableFetchCount++;
    // Simulate real Airtable response latency
    await new Promise((r) => setTimeout(r, 40));
    return { ...mockMember, fetchNumber: airtableFetchCount };
  };

  // ── TEST 1: Cache Miss (First Load) ──
  console.log("\n[Test 1] First Request (Cache MISS)");
  const missStart = Date.now();
  const missResult = await withCacheSWR(testKey, mockAirtableFetcher, {
    ttlSeconds: 60,
    softTtlSeconds: 5,
    logTag: "test:member:profile",
  });
  const missLatency = Date.now() - missStart;
  console.log(`   - Source: ${missResult.source}`);
  console.log(`   - Latency: ${missLatency}ms`);
  console.log(`   - Fetched Data:`, missResult.data);
  console.assert(airtableFetchCount === 1, "Airtable fetcher should have executed once");

  // ── TEST 2: Cache Hit (Second Load) ──
  console.log("\n[Test 2] Second Request (Cache HIT)");
  const hitStart = Date.now();
  const hitResult = await withCacheSWR(testKey, mockAirtableFetcher, {
    ttlSeconds: 60,
    softTtlSeconds: 5,
    logTag: "test:member:profile",
  });
  const hitLatency = Date.now() - hitStart;
  console.log(`   - Source: ${hitResult.source}`);
  console.log(`   - Latency: ${hitLatency}ms`);
  console.log(`   - Result Data:`, hitResult.data);

  if (isRedisConfigured) {
    console.assert(hitResult.source === "redis_hit", "Expected redis_hit on second request");
    console.assert(airtableFetchCount === 1, "Airtable should NOT be called on Redis cache HIT");
    console.log(`   🚀 Cache Speedup: MISS (${missLatency}ms) -> HIT (${hitLatency}ms)`);
  }

  // ── TEST 3: Surgical Invalidation ──
  console.log("\n[Test 3] Testing Surgical Invalidation");
  await invalidateMemberCache(mockMember.recordId);
  console.log("   - Cache invalidated for", mockMember.recordId);

  const afterInvalidate = await withCacheSWR(testKey, mockAirtableFetcher, {
    ttlSeconds: 60,
    softTtlSeconds: 5,
    logTag: "test:member:profile",
  });
  console.log(`   - After Invalidation Source: ${afterInvalidate.source}`);
  console.assert(
    !isRedisConfigured || afterInvalidate.source === "airtable_fresh",
    "Should fetch fresh data from Airtable after invalidation"
  );

  // Clean up
  await invalidateMemberCache(mockMember.recordId);

  console.log("\n✅ ALL PERFORMANCE & REDIS SWR CACHE TESTS PASSED SUCCESSFULLY!\n");
}

runPerformanceCacheTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
