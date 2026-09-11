export interface RetryConfig {
  baseDelay: number;
  maxDelay: number;
  maxRetries: number;
  timeoutMs: number;
  initialJitterMaxMs: number;
  jitter: "full" | "none" | "equal";
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelay: 500,
  maxDelay: 30000,
  maxRetries: 6,
  timeoutMs: 15000,
  initialJitterMaxMs: 350,
  jitter: "full",
  retryableStatuses: [408, 425, 429, 500, 502, 503, 504],
};

export interface FetchWithRetryOptions extends RequestInit {
  retryConfig?: Partial<RetryConfig>;
  idempotent?: boolean;
}

/**
 * Calculates exponential backoff with optional Full Jitter.
 * Formula: delay = random(0, min(baseDelay * 2^attempt, maxDelay))
 */
export function calculateBackoffWithJitter(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const expDelay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
  if (config.jitter === "full") {
    return Math.floor(Math.random() * (expDelay + 1));
  }
  if (config.jitter === "equal") {
    return Math.floor(expDelay / 2 + Math.random() * (expDelay / 2 + 1));
  }
  return expDelay;
}

/**
 * Parses the HTTP Retry-After header value (in seconds or HTTP-date string).
 */
export function getRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) return null;

  const seconds = Number(header);
  if (!isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (!isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

/**
 * Checks if the HTTP method is safe/idempotent according to RFC specs.
 */
export function isSafeOrIdempotentMethod(method?: string): boolean {
  const m = (method || "GET").toUpperCase();
  return ["GET", "HEAD", "OPTIONS", "TRACE"].includes(m);
}

/**
 * Sleep helper that respects AbortSignal cancellation.
 */
export function cancellableSleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Helper to combine multiple AbortSignals.
 */
function anySignal(signals: (AbortSignal | undefined | null)[]): AbortSignal {
  const activeSignals = signals.filter((s): s is AbortSignal => Boolean(s));
  if (activeSignals.length === 0) return new AbortController().signal;
  if (activeSignals.length === 1) return activeSignals[0];

  const controller = new AbortController();
  for (const sig of activeSignals) {
    if (sig.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * Centralized fetch wrapper implementing:
 * 1. Initial Pre-Request Random Jitter (prevents Thundering Herd upon 100+ concurrent requests).
 * 2. Exponential Backoff with Full Jitter for 429 and 5xx errors.
 * 3. Configurable timeout via AbortController.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: FetchWithRetryOptions
): Promise<Response> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...init?.retryConfig,
  };

  // ── Pre-Request Initial Jitter ─────────────────────────────────────────────
  // Spreads concurrent burst requests across a randomized time window (0 to initialJitterMaxMs)
  // before the first request hits the server, smoothing out 150+ concurrent requests.
  if (config.initialJitterMaxMs && config.initialJitterMaxMs > 0) {
    const preDelay = Math.floor(Math.random() * (config.initialJitterMaxMs + 1));
    if (preDelay > 0) {
      await cancellableSleep(preDelay, init?.signal);
    }
  }

  const method = init?.method || "GET";
  const isIdempotent = init?.idempotent ?? isSafeOrIdempotentMethod(method);

  let attempt = 0;

  while (true) {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    const controller = new AbortController();
    let timeoutTimer: NodeJS.Timeout | number | null = null;

    if (config.timeoutMs && config.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => controller.abort(), config.timeoutMs);
    }

    const combinedSignal = anySignal([init?.signal, controller.signal]);

    try {
      const response = await fetch(input, {
        ...init,
        signal: combinedSignal,
      });

      if (timeoutTimer !== null) clearTimeout(timeoutTimer);

      if (response.ok) {
        return response;
      }

      const isRetryableStatus = config.retryableStatuses.includes(response.status);
      const canRetry = isIdempotent && isRetryableStatus && attempt < config.maxRetries;

      if (!canRetry) {
        return response;
      }

      const retryAfter = getRetryAfterMs(response);
      const calculatedDelay = calculateBackoffWithJitter(attempt, config);
      // When Retry-After is returned by Airtable, add jitter to prevent synchronized wakeups
      const finalDelay =
        retryAfter !== null
          ? Math.min(retryAfter + Math.floor(Math.random() * 1000), config.maxDelay)
          : calculatedDelay;

      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[API Retry] Request to "${input.toString()}" returned status ${response.status}. ` +
            `Retry attempt ${attempt + 1}/${config.maxRetries}. ` +
            `Waiting ${finalDelay}ms before next attempt.`
        );
      }

      attempt++;
      await cancellableSleep(finalDelay, init?.signal);
    } catch (err: unknown) {
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);

      const isCallerAborted = err instanceof Error && err.name === "AbortError" && init?.signal?.aborted;
      if (isCallerAborted) {
        throw err;
      }

      const canRetryNetwork = isIdempotent && attempt < config.maxRetries;
      if (!canRetryNetwork) {
        throw err;
      }

      const finalDelay = calculateBackoffWithJitter(attempt, config);

      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[API Retry] Network/Timeout error on "${input.toString()}". ` +
            `Retry attempt ${attempt + 1}/${config.maxRetries}. ` +
            `Retrying in ${finalDelay}ms...`
        );
      }

      attempt++;
      await cancellableSleep(finalDelay, init?.signal);
    }
  }
}
