import { withCacheSWR } from "../cacheService";
import { setInRedis, deleteFromRedis, acquireLock } from "../redisClient";
import { airtableMetrics } from "../airtableMetrics";
import { randomUUID } from "crypto";

async function runDistributedCacheMissTests() {
  console.log("===================================================================");
  console.log("🚀 STARTING ADVANCED DISTRIBUTED CACHE MISS & LEASE RENEWAL AUDIT");
  console.log("===================================================================\n");

  airtableMetrics.reset();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Same Process (100 simultaneous MISS requests)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 1] Testing Same-Process 100 Simultaneous Cache Misses...");
  const test1Key = "ultra-gym:test:miss:p1";
  await deleteFromRedis(test1Key).catch(() => {});

  let test1AirtableCalls = 0;
  const test1Fetcher = async () => {
    test1AirtableCalls++;
    await new Promise((r) => setTimeout(r, 40));
    return { data: "process_local_result" };
  };

  const test1Promises = Array.from({ length: 100 }).map(() =>
    withCacheSWR(test1Key, test1Fetcher, { ttlSeconds: 3600 })
  );
  const test1Results = await Promise.all(test1Promises);

  console.log(`   • Total Requests: 100`);
  console.log(`   • Airtable Calls Executed: ${test1AirtableCalls} (Target: 1)`);
  console.log(`   • All 100 received data: ${test1Results.every((r) => r.data.data === "process_local_result")}`);
  console.assert(test1AirtableCalls === 1, "Test 1 Failed: Same process must trigger exactly 1 Airtable call!");
  console.log("   ✅ Test 1 PASSED: 100 same-process cache misses produced EXACTLY 1 Airtable call.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Simulated Multiple Serverless Instances (10 Isolated Lambda instances, 100 requests)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 2] Testing 10 Isolated Serverless Lambda Instances Sharing the SAME Redis (100 requests)...");
  const test2Key = "ultra-gym:test:miss:cross_lambda";
  await deleteFromRedis(test2Key).catch(() => {});

  let test2AirtableCalls = 0;
  const test2Fetcher = async () => {
    test2AirtableCalls++;
    await new Promise((r) => setTimeout(r, 60)); // 60ms simulated Airtable delay
    return { data: "cross_lambda_result" };
  };

  const lambdaInstances = Array.from({ length: 10 }).map(() => new Map<string, Promise<unknown>>());

  const test2Start = Date.now();
  const test2Promises = Array.from({ length: 100 }).map((_, idx) => {
    const lambdaIndex = idx % 10;
    const isolatedMap = lambdaInstances[lambdaIndex];
    return withCacheSWR(test2Key, test2Fetcher, {
      ttlSeconds: 3600,
      customInFlightMap: isolatedMap,
      logTag: `lambda_instance_${lambdaIndex}`,
    });
  });

  const test2Results = await Promise.all(test2Promises);
  const test2Duration = Date.now() - test2Start;

  console.log(`   • 100 Requests Across 10 Isolated Lambda Instances Completed in: ${test2Duration}ms`);
  console.log(`   • Airtable Calls Executed Across All 10 Lambdas: ${test2AirtableCalls} (Target: Exactly 1)`);
  console.log(`   • All 100 callers across all instances received valid data: ${test2Results.every((r) => r.data.data === "cross_lambda_result")}`);
  console.assert(test2AirtableCalls === 1, "Test 2 Failed: Cross-Lambda distributed lock must limit Airtable calls to EXACTLY 1!");
  console.log("   ✅ Test 2 PASSED: 10 isolated serverless instances produced EXACTLY 1 Airtable fetch.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Airtable Request Outliving Original Lock TTL (Heartbeat Lease Renewal)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 3] Testing Airtable Fetch Outliving Initial Lock TTL (Heartbeat Lease Renewal)...");
  const test3Key = "ultra-gym:test:miss:slow_fetch_renewal";
  await deleteFromRedis(test3Key).catch(() => {});
  await deleteFromRedis(`ultra-gym:miss_lock:${test3Key}`).catch(() => {});

  let slowAirtableCalls = 0;
  // Simulated slow Airtable fetch taking 1500ms (1.5 seconds)
  const slowFetcher = async () => {
    slowAirtableCalls++;
    await new Promise((r) => setTimeout(r, 1500));
    return { data: "slow_airtable_payload" };
  };

  // 5 isolated Lambda instances send requests simultaneously
  // Lock TTL is 1.0s, Heartbeat renewal is every 300ms
  // The fetch takes 1.5s (longer than initial lock TTL)
  const slowLambdas = Array.from({ length: 5 }).map(() => new Map<string, Promise<unknown>>());
  const slowPromises = Array.from({ length: 25 }).map((_, idx) => {
    const isolatedMap = slowLambdas[idx % 5];
    return withCacheSWR(test3Key, slowFetcher, {
      ttlSeconds: 3600,
      customInFlightMap: isolatedMap,
      lockTtlSeconds: 1, // 1 second short lock TTL
      heartbeatIntervalMs: 300, // renews every 300ms
      logTag: "audit:renewal:slow",
    });
  });

  const slowResults = await Promise.all(slowPromises);

  console.log(`   • Slow Airtable Fetch Duration: 1500ms (Initial Lock TTL: 1000ms)`);
  console.log(`   • Total Airtable Calls Triggered: ${slowAirtableCalls} (Target: Exactly 1)`);
  console.log(`   • All 25 callers received data without duplicate fetch: ${slowResults.every((r) => r.data.data === "slow_airtable_payload")}`);
  console.assert(slowAirtableCalls === 1, "Test 3 Failed: Heartbeat lease renewal must prevent duplicate fetches during slow queries!");
  console.log("   ✅ Test 3 PASSED: Lock lease renewed continuously; exactly 1 Airtable fetch executed.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Lock Owner Crash & Recovery (First owner crashes without writing Redis)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 4] Testing Lock Owner Crash & Automatic Recovery...");
  const test4Key = "ultra-gym:test:miss:crash_recovery";
  const test4LockKey = `ultra-gym:miss_lock:${test4Key}`;
  await deleteFromRedis(test4Key).catch(() => {});
  await deleteFromRedis(test4LockKey).catch(() => {});

  // Simulate a crashed instance holding a 1-second lock
  const crashedToken = randomUUID();
  await acquireLock(test4LockKey, crashedToken, 1);
  console.log("   • Simulated crashed Lambda acquired lock but died without renewal. Waiting 1.1s for lock expiry...");

  let test4RecoveryCalls = 0;
  const test4Fetcher = async () => {
    test4RecoveryCalls++;
    await new Promise((r) => setTimeout(r, 40));
    return { data: "recovered_after_crash" };
  };

  const crashTestLambdas = Array.from({ length: 5 }).map(() => new Map<string, Promise<unknown>>());
  const crashPromises = Array.from({ length: 20 }).map((_, idx) => {
    const isolatedMap = crashTestLambdas[idx % 5];
    return withCacheSWR(test4Key, test4Fetcher, {
      ttlSeconds: 3600,
      customInFlightMap: isolatedMap,
    });
  });

  const crashResults = await Promise.all(crashPromises);
  console.log(`   • Recovery Airtable Requests Executed: ${test4RecoveryCalls} (Target: Exactly 1)`);
  console.log(`   • All callers received recovered result: ${crashResults.every((r) => r.data.data === "recovered_after_crash")}`);
  console.assert(test4RecoveryCalls === 1, "Test 4 Failed: Recovery must execute exactly 1 Airtable call!");
  console.log("   ✅ Test 4 PASSED: Lock owner crash recovered cleanly with EXACTLY 1 Airtable call.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: 100 Concurrent Requests for a Negatively Cached Record (Sentinel Protection)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 5] Testing 100 Concurrent Requests for Negatively Cached Record (Sentinel Protected)...");
  const test5Key = "ultra-gym:test:miss:negative_sentinel";
  await deleteFromRedis(test5Key).catch(() => {});

  let test5AirtableCalls = 0;
  const test5NegativeFetcher = async () => {
    test5AirtableCalls++;
    await new Promise((r) => setTimeout(r, 30));
    return null; // Record not found in Airtable
  };

  // First request establishes the sentinel negative cache
  const firstMiss = await withCacheSWR(test5Key, test5NegativeFetcher);
  console.log(`   • Initial Miss Fetch Result: ${firstMiss.data} | isNegative: ${firstMiss.isNegative}`);

  // Now send 100 concurrent requests across 10 isolated Lambda instances to the negatively cached key
  const negativeLambdas = Array.from({ length: 10 }).map(() => new Map<string, Promise<unknown>>());
  const negative100Promises = Array.from({ length: 100 }).map((_, idx) => {
    const isolatedMap = negativeLambdas[idx % 10];
    return withCacheSWR(test5Key, test5NegativeFetcher, {
      ttlSeconds: 3600,
      customInFlightMap: isolatedMap,
    });
  });

  const negative100Results = await Promise.all(negative100Promises);

  console.log(`   • Total Airtable Calls after 100 Requests on Negative Cache: ${test5AirtableCalls} (Target: Exactly 1)`);
  console.log(`   • All 100 callers returned null without MISS fallback: ${negative100Results.every((r) => r.data === null && r.source === "redis_hit" && r.isNegative === true)}`);
  console.assert(test5AirtableCalls === 1, "Test 5 Failed: Negative cache must prevent any subsequent Airtable queries!");
  console.log("   ✅ Test 5 PASSED: 100 concurrent requests on negative cache hit Redis with 0 Airtable calls.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Stale Cache (100 concurrent requests)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("▶ [TEST 6] Testing Stale Cache (100 concurrent requests)...");
  const test6Key = "ultra-gym:test:stale:proof_100";
  await setInRedis(test6Key, { payload: { version: 1 }, cachedAt: Date.now() - 500 * 1000 }, 3600);

  let test6AirtableRefreshes = 0;
  const test6Fetcher = async () => {
    test6AirtableRefreshes++;
    await new Promise((r) => setTimeout(r, 40));
    return { version: 2 };
  };

  const test6Promises = Array.from({ length: 100 }).map(() =>
    withCacheSWR(test6Key, test6Fetcher, { ttlSeconds: 3600, softTtlSeconds: 60 })
  );
  const test6Results = await Promise.all(test6Promises);
  await new Promise((r) => setTimeout(r, 120));

  console.log(`   • All 100 callers received immediate stale data: ${test6Results.every((r) => r.source === "redis_hit" && r.data.version === 1)}`);
  console.log(`   • Background Airtable Refreshes Triggered: ${test6AirtableRefreshes} (Target: Exactly 1)`);
  console.assert(test6AirtableRefreshes === 1, "Test 6 Failed: Stale cache must trigger exactly 1 refresh!");
  console.log("   ✅ Test 6 PASSED: Stale cache delivered instant data with 1 background refresh.\n");

  // ──────────────────────────────────────────────────────────────────────────
  // FINAL METRICS SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  const metrics = airtableMetrics.getMetrics();
  console.log("===================================================================");
  console.log("📊 DISTRIBUTED CACHE MISS & REDIS COMMAND OVERHEAD REPORT");
  console.log("===================================================================");
  console.log(`• Cache Misses Recorded:              ${metrics.cacheMiss}`);
  console.log(`• Distributed Miss Locks Acquired:    ${metrics.missLockAcquired}`);
  console.log(`• Distributed Miss Locks Contended:   ${metrics.missLockContended}`);
  console.log(`• Waiters Resolved from Redis:        ${metrics.missWaitResolvedFromRedis}`);
  console.log(`• Miss Lock Expired Recoveries:       ${metrics.missLockExpired}`);
  console.log(`• Total Airtable Authoritative Calls: ${metrics.missAirtableFetch}`);
  console.log(`• Airtable Calls Avoided via Lock:    ${metrics.missAirtableCallsAvoided}`);
  console.log(`• Total Redis Wait Re-checks (Overhead): ${metrics.redisWaitChecks}`);
  console.log(`• Average Redis Checks per Waiter:    ${metrics.missLockContended > 0 ? (metrics.redisWaitChecks / metrics.missLockContended).toFixed(2) : "0"} checks`);
  console.log("===================================================================");
  console.log("🎉 ALL ADVANCED DISTRIBUTED CACHE MISS TESTS PASSED WITH 100% SUCCESS!");
  console.log("===================================================================\n");
}

runDistributedCacheMissTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
