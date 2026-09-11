import { NextResponse } from "next/server";

interface RateLimitOptions {
  windowMs?: number; // Duration window in milliseconds (default: 60,000ms = 1 min)
  maxRequests?: number; // Maximum allowed requests in that window (default: 5)
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// In-memory request bucket tracker
const rateLimitMap = new Map<string, RateLimitBucket>();
const MAX_MAP_SIZE = 10000;

/**
 * Checks if a specific key (e.g. `login:${clientIp}`) has exceeded its allowed request limit.
 * Works seamlessly in Next.js Serverless and Edge runtimes with zero external dependencies.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { isLimited: boolean; remaining: number; resetInSeconds: number } {
  const windowMs = options.windowMs || 60_000; // 1 minute
  const maxRequests = options.maxRequests || 5; // 5 attempts
  const now = Date.now();

  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    // Prevent memory leaks in long-running instances
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      rateLimitMap.clear();
    }
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return {
      isLimited: false,
      remaining: maxRequests - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  record.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

  if (record.count > maxRequests) {
    return {
      isLimited: true,
      remaining: 0,
      resetInSeconds,
    };
  }

  return {
    isLimited: false,
    remaining: maxRequests - record.count,
    resetInSeconds,
  };
}

/**
 * Returns a standardized 429 Too Many Requests response.
 */
export function createRateLimitResponse(
  message = "Too many login attempts, please try again later",
  retryAfterSeconds = 60
): NextResponse {
  return NextResponse.json(
    {
      error: "too_many_requests",
      message,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Content-Type": "application/json",
      },
    }
  );
}
