import { AIRTABLE_BASE_ID, AIRTABLE_TOKEN } from "./constants";
import { airtableMetrics } from "./airtableMetrics";
import { sanitizeMetricSource, mapTableToLogicalSource } from "./metricsService";

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

// ─── TypeScript Interfaces ──────────────────────────────────────────────────

export interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: T;
}

export interface AirtableListResponse<T = Record<string, unknown>> {
  records: AirtableRecord<T>[];
  offset?: string;
}

export interface AirtableErrorResponse {
  error?: {
    type?: string;
    message?: string;
  };
}

export interface AirtableListParams {
  pageSize?: number;
  offset?: string;
  sort?: { field: string; direction?: "asc" | "desc" }[];
  filterByFormula?: string;
  fields?: string[];
  maxRecords?: number;
  /**
   * Seconds to let Next.js's Data Cache serve this read without hitting
   * Airtable again (via `next: { revalidate }` on the underlying fetch).
   */
  revalidate?: number;
  /** Cache tags for on-demand invalidation via revalidateTag(). */
  tags?: string[];
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  timeoutMs: number;
  initialJitterMaxMs: number;
  jitter: "full" | "none" | "equal";
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 6,
  baseDelay: 500,
  maxDelay: 30000,
  timeoutMs: 15000,
  initialJitterMaxMs: 0,
  jitter: "full",
  retryableStatuses: [408, 425, 429, 500, 502, 503, 504],
};

// ─── Authentication & Headers ───────────────────────────────────────────────

function assertEnv() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
    throw new Error(
      "Missing Airtable credentials: Ensure AIRTABLE_BASE_ID and AIRTABLE_TOKEN are set in .env.local."
    );
  }
}

function headers(): Record<string, string> {
  assertEnv();
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// ─── Exponential Backoff & Jitter Helpers ────────────────────────────────────

/**
 * Calculates exponential backoff delay with Full Jitter:
 * Formula: delay = random(0, min(baseDelay * 2^attempt, maxDelay))
 */
function calculateBackoffWithJitter(
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
 * Parses the HTTP Retry-After header if provided by Airtable (seconds or HTTP date).
 */
function getRetryAfterMs(response: Response): number | null {
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
 * Promise-based sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Native fetch With Retry & Backoff ──────────────────────────────────────

/**
 * Core native fetch wrapper that executes HTTP requests against Airtable
 * with automatic initial pre-request jitter, exponential backoff, jitter, and timeout handling.
 */
export async function airtableFetch(
  url: string,
  init?: RequestInit,
  customRetryConfig?: Partial<RetryConfig>,
  metricSource?: string
): Promise<Response> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...customRetryConfig,
  };

  // ── Pre-Request Initial Jitter ─────────────────────────────────────────────
  // Spreads concurrent burst requests across a randomized time window (0 to initialJitterMaxMs)
  // before the first request hits the server, smoothing out 150+ concurrent requests.
  if (config.initialJitterMaxMs && config.initialJitterMaxMs > 0) {
    const preDelay = Math.floor(Math.random() * (config.initialJitterMaxMs + 1));
    if (preDelay > 0) {
      await sleep(preDelay);
    }
  }

  let attempt = 0;

  while (true) {
    // Setup request timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const isWrite = init?.method && ["POST", "PATCH", "PUT", "DELETE"].includes(init.method.toUpperCase());
      const safeSource = metricSource ? mapTableToLogicalSource(metricSource) : sanitizeMetricSource(url);
      if (isWrite) {
        airtableMetrics.recordWrite(safeSource);
      } else {
        airtableMetrics.recordRead(safeSource);
      }

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Return immediately on success (2xx) or client errors other than 429
      if (response.ok) {
        return response;
      }

      const isRetryable = config.retryableStatuses.includes(response.status);
      const canRetry = isRetryable && attempt < config.maxRetries;

      if (!canRetry) {
        return response;
      }

      // Calculate backoff delay with Jitter or Retry-After header
      const retryAfter = getRetryAfterMs(response);
      const calculatedDelay = calculateBackoffWithJitter(attempt, config);
      const delayMs =
        retryAfter !== null
          ? Math.min(retryAfter + Math.floor(Math.random() * 1000), config.maxDelay)
          : calculatedDelay;

      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[Airtable Retry] Request to "${url}" received status ${response.status}. ` +
            `Retry attempt ${attempt + 1}/${config.maxRetries} after ${delayMs}ms.`
        );
      }

      attempt++;
      await sleep(delayMs);
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      const isAbortError = err instanceof Error && err.name === "AbortError";
      const canRetry = attempt < config.maxRetries;

      if (canRetry) {
        const delayMs = calculateBackoffWithJitter(attempt, config);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[Airtable Retry] Network/Timeout error on "${url}" (${isAbortError ? "Timeout" : "Network"}). ` +
              `Retry attempt ${attempt + 1}/${config.maxRetries} after ${delayMs}ms.`
          );
        }
        attempt++;
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
}

// ─── Attachments Helper ─────────────────────────────────────────────────────

export function getAttachmentUrl(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0] as
    | { url?: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }
    | undefined;
  if (!first) return null;
  return (
    first.thumbnails?.large?.url ||
    first.thumbnails?.small?.url ||
    first.url ||
    null
  );
}

// ─── Core Database Operations ───────────────────────────────────────────────

/**
 * Fetch records from an Airtable table with filtering, sorting, pagination, and caching.
 */
export async function getRecords<T = Record<string, unknown>>(
  tableName: string,
  params?: AirtableListParams
): Promise<AirtableRecord<T>[]> {
  const allRecords: AirtableRecord<T>[] = [];
  let offset: string | undefined = params?.offset;

  do {
    const searchParams = new URLSearchParams();
    searchParams.set("pageSize", String(params?.pageSize ?? 100));
    if (offset) searchParams.set("offset", offset);
    if (params?.filterByFormula)
      searchParams.set("filterByFormula", params.filterByFormula);
    if (params?.maxRecords)
      searchParams.set("maxRecords", String(params.maxRecords));
    if (params?.fields) {
      params.fields.forEach((f) => searchParams.append("fields[]", f));
    }
    if (params?.sort) {
      params.sort.forEach((s, i) => {
        searchParams.set(`sort[${i}][field]`, s.field);
        searchParams.set(`sort[${i}][direction]`, s.direction ?? "asc");
      });
    }

    const url = `${BASE_URL}/${encodeURIComponent(tableName)}?${searchParams.toString()}`;
    const res = await airtableFetch(url, {
      headers: headers(),
      ...(params?.revalidate != null
        ? { next: { revalidate: params.revalidate, tags: params.tags } }
        : { cache: "no-store" as const }),
    });

    if (!res.ok) {
      const err: AirtableErrorResponse = await res.json().catch(() => ({}));
      // If a pagination cursor offset expired or failed mid-stream, return records collected so far
      if (offset && allRecords.length > 0 && res.status === 422) {
        console.warn(`[Airtable] Stale pagination cursor for ${tableName}, returning ${allRecords.length} records`);
        break;
      }
      throw new Error(
        `Airtable query error (${tableName}): ${err.error?.message ?? res.statusText ?? res.status}`
      );
    }

    const data: AirtableListResponse<T> = await res.json();
    allRecords.push(...data.records);
    offset = data.offset;

    if (params?.maxRecords && allRecords.length >= params.maxRecords) {
      return allRecords.slice(0, params.maxRecords);
    }
  } while (offset);

  return allRecords;
}

/**
 * Fetch a single record by its Airtable record ID.
 */
export async function getRecordById<T = Record<string, unknown>>(
  tableName: string,
  recordId: string,
  options?: { revalidate?: number; tags?: string[] }
): Promise<AirtableRecord<T>> {
  const url = `${BASE_URL}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await airtableFetch(url, {
    headers: headers(),
    ...(options?.revalidate != null
      ? { next: { revalidate: options.revalidate, tags: options.tags } }
      : { cache: "no-store" as const }),
  });

  if (!res.ok) {
    const err: AirtableErrorResponse = await res.json().catch(() => ({}));
    throw new Error(
      `Airtable error fetching ID (${tableName}/${recordId}): ${err.error?.message ?? res.statusText ?? res.status}`
    );
  }

  return res.json() as Promise<AirtableRecord<T>>;
}

/**
 * Fetch multiple records by an array of IDs in batch chunks using OR(RECORD_ID()=...) formula.
 */
export async function getRecordsByIds<T = Record<string, unknown>>(
  tableName: string,
  ids: string[],
  params?: Omit<AirtableListParams, "filterByFormula">
): Promise<AirtableRecord<T>[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];

  const CHUNK = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    chunks.push(unique.slice(i, i + CHUNK));
  }

  const results = await Promise.all(
    chunks.map((chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      return getRecords<T>(tableName, { ...params, filterByFormula: formula });
    })
  );

  return results.flat();
}

/**
 * Query records using an Airtable formula filter.
 */
export async function getRecordsByFilter<T = Record<string, unknown>>(
  tableName: string,
  filterFormula: string,
  params?: Omit<AirtableListParams, "filterByFormula">
): Promise<AirtableRecord<T>[]> {
  return getRecords<T>(tableName, { ...params, filterByFormula: filterFormula });
}

/**
 * Create a single record in an Airtable table.
 */
export async function createRecord<T = Record<string, unknown>>(
  tableName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<T>> {
  const url = `${BASE_URL}/${encodeURIComponent(tableName)}`;
  const res = await airtableFetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err: AirtableErrorResponse = await res.json().catch(() => ({}));
    throw new Error(
      `Airtable create error (${tableName}): ${err.error?.message ?? res.statusText ?? res.status}`
    );
  }

  return res.json() as Promise<AirtableRecord<T>>;
}

/**
 * Create multiple records in batches (Airtable allows up to 10 records per POST request).
 */
export async function createRecords<T = Record<string, unknown>>(
  tableName: string,
  records: { fields: Record<string, unknown> }[]
): Promise<{ records: AirtableRecord<T>[] }> {
  if (records.length === 0) return { records: [] };

  const CHUNK = 10;
  const created: AirtableRecord<T>[] = [];

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const url = `${BASE_URL}/${encodeURIComponent(tableName)}`;
    const res = await airtableFetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ records: chunk }),
    });

    if (!res.ok) {
      const err: AirtableErrorResponse = await res.json().catch(() => ({}));
      throw new Error(
        `Airtable batch create error (${tableName}): ${err.error?.message ?? res.statusText ?? res.status}`
      );
    }

    const data = (await res.json()) as { records: AirtableRecord<T>[] };
    created.push(...data.records);
  }

  return { records: created };
}

/**
 * Update an existing record in Airtable by its ID.
 */
export async function updateRecord<T = Record<string, unknown>>(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<T>> {
  const url = `${BASE_URL}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await airtableFetch(url, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err: AirtableErrorResponse = await res.json().catch(() => ({}));
    throw new Error(
      `Airtable update error (${tableName}/${recordId}): ${err.error?.message ?? res.statusText ?? res.status}`
    );
  }

  return res.json() as Promise<AirtableRecord<T>>;
}

/**
 * Delete a single record from Airtable.
 */
export async function deleteRecord(
  tableName: string,
  recordId: string
): Promise<{ deleted: boolean; id: string }> {
  const url = `${BASE_URL}/${encodeURIComponent(tableName)}/${recordId}`;
  const res = await airtableFetch(url, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const err: AirtableErrorResponse = await res.json().catch(() => ({}));
    throw new Error(
      `Airtable delete error (${tableName}/${recordId}): ${err.error?.message ?? res.statusText ?? res.status}`
    );
  }

  return res.json() as Promise<{ deleted: boolean; id: string }>;
}

/**
 * Delete multiple records from Airtable in batches of up to 10 IDs per DELETE request.
 */
export async function deleteRecords(
  tableName: string,
  recordIds: string[]
): Promise<void> {
  const unique = [...new Set(recordIds)].filter(Boolean);
  if (unique.length === 0) return;

  const CHUNK = 10;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const searchParams = new URLSearchParams();
    chunk.forEach((id) => searchParams.append("records[]", id));

    const url = `${BASE_URL}/${encodeURIComponent(tableName)}?${searchParams.toString()}`;
    const res = await airtableFetch(url, {
      method: "DELETE",
      headers: headers(),
    });

    if (!res.ok) {
      const err: AirtableErrorResponse = await res.json().catch(() => ({}));
      throw new Error(
        `Airtable batch delete error (${tableName}): ${err.error?.message ?? res.statusText ?? res.status}`
      );
    }
  }
}
