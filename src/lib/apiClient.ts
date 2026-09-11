import { fetchWithRetry, type FetchWithRetryOptions } from "./fetchWithRetry";

/**
 * Primary API client function for performing HTTP requests with automatic
 * exponential backoff + jitter retry handling.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: FetchWithRetryOptions
): Promise<Response> {
  return fetchWithRetry(input, init);
}

/**
 * Helper to perform JSON API requests with automatic retry.
 */
export async function apiFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: FetchWithRetryOptions
): Promise<T> {
  const res = await apiFetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export * from "./fetchWithRetry";
