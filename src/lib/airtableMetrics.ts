/**
 * Ultra Gym Real-Time Airtable & Redis Metrics Tracker
 * Used to audit, log, and guarantee minimization of Airtable API calls.
 */

export interface AirtableMetricsState {
  totalAirtableReads: number;
  totalAirtableWrites: number;
  redisHits: number;
  redisMisses: number;
  redisStaleHits: number;
  singleFlightMissesCoalesced: number;
  stampedeRefreshesAvoided: number;
  
  // Distributed Cache MISS Metrics
  cacheMiss: number;
  missLockAcquired: number;
  missLockContended: number;
  missWaitResolvedFromRedis: number;
  missLockExpired: number;
  missAirtableFetch: number;
  missAirtableCallsAvoided: number;
  redisWaitChecks: number;

  sessionStartTime: number;
}

const state: AirtableMetricsState = {
  totalAirtableReads: 0,
  totalAirtableWrites: 0,
  redisHits: 0,
  redisMisses: 0,
  redisStaleHits: 0,
  singleFlightMissesCoalesced: 0,
  stampedeRefreshesAvoided: 0,
  
  cacheMiss: 0,
  missLockAcquired: 0,
  missLockContended: 0,
  missWaitResolvedFromRedis: 0,
  missLockExpired: 0,
  missAirtableFetch: 0,
  missAirtableCallsAvoided: 0,
  redisWaitChecks: 0,

  sessionStartTime: Date.now(),
};

import { metrics } from "@/lib/metricsService";

export const airtableMetrics = {
  recordRead(tableName?: string, count: number = 1) {
    state.totalAirtableReads += count;
    metrics.recordAirtableRead(tableName).catch(() => {});
    if (process.env.NODE_ENV !== "production") {
      console.log(`[AIRTABLE METRICS] 📥 Read recorded for "${tableName || "table"}". Total Reads: ${state.totalAirtableReads}`);
    }
  },

  recordWrite(tableName?: string, count: number = 1) {
    state.totalAirtableWrites += count;
    metrics.recordAirtableWrite().catch(() => {});
    if (process.env.NODE_ENV !== "production") {
      console.log(`[AIRTABLE METRICS] ✍ Write recorded for "${tableName || "table"}". Total Writes: ${state.totalAirtableWrites}`);
    }
  },

  recordRedisHit(isStale = false, resource?: string) {
    if (isStale) {
      state.redisStaleHits++;
      metrics.recordRedisStaleHit(resource).catch(() => {});
    } else {
      state.redisHits++;
      metrics.recordRedisFreshHit(resource).catch(() => {});
    }
    metrics.recordCallsAvoided(1).catch(() => {});
  },

  recordRedisMiss(resource?: string) {
    state.redisMisses++;
    state.cacheMiss++;
    metrics.recordRedisMiss(resource).catch(() => {});
  },

  recordSingleFlightSavings() {
    state.singleFlightMissesCoalesced++;
    state.missAirtableCallsAvoided++;
    metrics.recordSingleFlight(1).catch(() => {});
    metrics.recordCallsAvoided(1).catch(() => {});
  },

  recordStampedeAvoided() {
    state.stampedeRefreshesAvoided++;
    metrics.recordStampede(1).catch(() => {});
    metrics.recordCallsAvoided(1).catch(() => {});
  },

  // Distributed Cache MISS Helpers
  recordMissLockAcquired() {
    state.missLockAcquired++;
    metrics.recordLockAcquired().catch(() => {});
  },

  recordMissLockContended() {
    state.missLockContended++;
    metrics.recordLockContended().catch(() => {});
  },

  recordMissWaitResolved() {
    state.missWaitResolvedFromRedis++;
    state.missAirtableCallsAvoided++;
    metrics.recordLockWaitResolved().catch(() => {});
    metrics.recordCallsAvoided(1).catch(() => {});
  },

  recordMissLockExpired() {
    state.missLockExpired++;
    metrics.recordLockExpired().catch(() => {});
  },

  recordMissAirtableFetch() {
    state.missAirtableFetch++;
  },

  recordRedisWaitCheck() {
    state.redisWaitChecks++;
  },

  getMetrics(): AirtableMetricsState & { hitRatePercent: string } {
    const totalRequests = state.redisHits + state.redisStaleHits + state.redisMisses;
    const hitRate =
      totalRequests > 0
        ? `${(((state.redisHits + state.redisStaleHits) / totalRequests) * 100).toFixed(1)}%`
        : "N/A";

    return {
      ...state,
      hitRatePercent: hitRate,
    };
  },

  reset() {
    state.totalAirtableReads = 0;
    state.totalAirtableWrites = 0;
    state.redisHits = 0;
    state.redisMisses = 0;
    state.redisStaleHits = 0;
    state.singleFlightMissesCoalesced = 0;
    state.stampedeRefreshesAvoided = 0;

    state.cacheMiss = 0;
    state.missLockAcquired = 0;
    state.missLockContended = 0;
    state.missWaitResolvedFromRedis = 0;
    state.missLockExpired = 0;
    state.missAirtableFetch = 0;
    state.missAirtableCallsAvoided = 0;
    state.redisWaitChecks = 0;

    state.sessionStartTime = Date.now();
  },
};
