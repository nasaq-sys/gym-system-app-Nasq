"use client";

import { useEffect } from "react";

interface PerformanceTrace {
  fcp?: number;
  domInteractive?: number;
  domComplete?: number;
  apiRequests: Array<{ url: string; source?: string; latency?: string; durationMs: number }>;
}

declare global {
  interface Window {
    __startupDiagnostics__?: () => Record<string, unknown>;
  }
}

export default function PerformanceDiagnostics() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const trace: PerformanceTrace = {
      apiRequests: [],
    };

    // Capture Navigation & Paint Timing
    try {
      const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        trace.domInteractive = Math.round(navEntries[0].domInteractive);
        trace.domComplete = Math.round(navEntries[0].domComplete);
      }

      const paintEntries = performance.getEntriesByType("paint");
      for (const p of paintEntries) {
        if (p.name === "first-contentful-paint") {
          trace.fcp = Math.round(p.startTime);
        }
      }
    } catch {}

    const isDev = process.env.NODE_ENV === "development" || window.location.search.includes("diag=1");
    if (!isDev) return;

    // Intercept fetch to track API latencies & Redis cache headers in development mode
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "unknown";
      try {
        const res = await originalFetch(...args);
        const duration = Math.round(performance.now() - start);
        const source = res.headers.get("X-Cache-Source") || "network";
        const latency = res.headers.get("X-Cache-Latency") || `${duration}ms`;

        if (url.includes("/api/") && trace.apiRequests.length < 50) {
          trace.apiRequests.push({
            url: url.replace(window.location.origin, ""),
            source,
            latency,
            durationMs: duration,
          });
        }
        return res;
      } catch (err) {
        throw err;
      }
    };

    // Expose developer diagnostics function
    window.__startupDiagnostics__ = () => {
      const redisHits = trace.apiRequests.filter((r) => r.source === "redis_hit").length;
      const redisMisses = trace.apiRequests.filter((r) => r.source === "airtable_fresh").length;
      return {
        firstContentfulPaint: trace.fcp ? `${trace.fcp}ms` : "N/A",
        domInteractive: trace.domInteractive ? `${trace.domInteractive}ms` : "N/A",
        domComplete: trace.domComplete ? `${trace.domComplete}ms` : "N/A",
        redisStats: {
          hits: redisHits,
          misses: redisMisses,
          hitRatio: redisHits + redisMisses > 0 ? `${Math.round((redisHits / (redisHits + redisMisses)) * 100)}%` : "N/A",
        },
        apiTraces: trace.apiRequests,
      };
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
