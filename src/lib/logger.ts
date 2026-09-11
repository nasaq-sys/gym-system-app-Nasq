import { Logtail } from "@logtail/node";

const token = process.env.LOGTAIL_SOURCE_TOKEN;

/**
 * Securely initialize Logtail client.
 * If LOGTAIL_SOURCE_TOKEN is missing (e.g. in dev or local builds without .env),
 * it returns null to prevent app crashes and gracefully falls back to console.
 */
export const logtail = token
  ? new Logtail(token, {
      // In non-production, echo logs to console for local debugging
      sendLogsToConsoleOutput: process.env.NODE_ENV !== "production",
    })
  : null;

/**
 * Log helper for INFO level messages.
 * Automatically flushes logs so background batching completes cleanly on serverless / Edge functions.
 */
export async function logInfo(message: string, context: Record<string, unknown> = {}) {
  console.log(`[INFO] ${message}`, context);
  if (logtail) {
    try {
      await logtail.info(message, context);
      await logtail.flush();
    } catch (err) {
      console.error("[Logtail Error]", err);
    }
  }
}

/**
 * Log helper for WARN level messages (e.g. blocked IP attempt).
 */
export async function logWarn(message: string, context: Record<string, unknown> = {}) {
  console.warn(`[WARN] ${message}`, context);
  if (logtail) {
    try {
      await logtail.warn(message, context);
      await logtail.flush();
    } catch (err) {
      console.error("[Logtail Error]", err);
    }
  }
}

/**
 * Log helper for ERROR level messages.
 */
export async function logError(message: string, context: Record<string, unknown> = {}) {
  console.error(`[ERROR] ${message}`, context);
  if (logtail) {
    try {
      await logtail.error(message, context);
      await logtail.flush();
    } catch (err) {
      console.error("[Logtail Error]", err);
    }
  }
}
