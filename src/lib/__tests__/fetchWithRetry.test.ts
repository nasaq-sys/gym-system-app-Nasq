import {
  calculateBackoffWithJitter,
  getRetryAfterMs,
  isSafeOrIdempotentMethod,
  cancellableSleep,
  DEFAULT_RETRY_CONFIG,
} from "../fetchWithRetry";

async function runTests() {
  console.log("--- Testing calculateBackoffWithJitter ---");
  for (let attempt = 0; attempt < 5; attempt++) {
    const delay = calculateBackoffWithJitter(attempt, DEFAULT_RETRY_CONFIG);
    const maxExp = Math.min(DEFAULT_RETRY_CONFIG.baseDelay * Math.pow(2, attempt), DEFAULT_RETRY_CONFIG.maxDelay);
    console.assert(delay >= 0 && delay <= maxExp, `Attempt ${attempt} delay ${delay} out of bounds (max ${maxExp})`);
    console.log(`Attempt ${attempt}: calculated delay = ${delay}ms (max exp: ${maxExp}ms)`);
  }

  console.log("\n--- Testing getRetryAfterMs ---");
  const resSeconds = new Response(null, { headers: { "Retry-After": "5" } });
  console.assert(getRetryAfterMs(resSeconds) === 5000, "Retry-After seconds failed");
  
  const futureDate = new Date(Date.now() + 10000).toUTCString();
  const resDate = new Response(null, { headers: { "Retry-After": futureDate } });
  const dateMs = getRetryAfterMs(resDate);
  console.assert(dateMs !== null && dateMs > 8000 && dateMs <= 10000, "Retry-After HTTP date failed");

  console.log("\n--- Testing isSafeOrIdempotentMethod ---");
  console.assert(isSafeOrIdempotentMethod("GET") === true, "GET should be idempotent");
  console.assert(isSafeOrIdempotentMethod("HEAD") === true, "HEAD should be idempotent");
  console.assert(isSafeOrIdempotentMethod("POST") === false, "POST should not be idempotent by default");
  console.assert(isSafeOrIdempotentMethod("DELETE") === false, "DELETE should not be idempotent by default without option");

  console.log("\n--- Testing cancellableSleep ---");
  const controller = new AbortController();
  const sleepPromise = cancellableSleep(5000, controller.signal);
  controller.abort();
  try {
    await sleepPromise;
    console.assert(false, "Sleep should have rejected on abort");
  } catch (err: unknown) {
    console.assert((err as Error).name === "AbortError", "Error should be AbortError");
    console.log("Cancellation correctly rejected with AbortError");
  }

  console.log("\nAll unit assertions passed successfully!");
}

runTests().catch(console.error);
