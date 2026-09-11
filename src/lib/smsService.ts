/**
 * Ultra Gym — D7 Networks SMS Service
 *
 * Central server-side SMS integration. Handles:
 *  - Jordanian phone number normalization
 *  - D7 API communication (with controlled retry)
 *  - Idempotent send functions for registration, renewal, expiration
 *  - Redis-based idempotency guards (SET NX) to prevent duplicate sends
 *  - Failure isolation: SMS errors NEVER throw or break calling code
 *
 * SECURITY:
 *  - D7_API_TOKEN is NEVER exposed to the client
 *  - Passwords are NEVER logged or stored in metrics
 *  - Phone numbers are masked in all log output
 *
 * D7 API Reference: https://d7networks.com/docs/sms/send-sms/
 */

import { redis, isRedisConfigured, getFromRedis, setInRedis } from "@/lib/redisClient";
import {
  incrementSmsSent,
  incrementSmsFailed,
  incrementSmsSkipped,
  incrementD7ApiError,
  recordSmsStatus,
} from "@/lib/smsMetrics";

// ── Constants ────────────────────────────────────────────────────────────────

const D7_API_URL = "https://api.d7networks.com/messages/v1/send";

/** Idempotency TTL: 90 days — prevents duplicate sends long-term */
const IDEMPOTENCY_TTL_SECONDS = 90 * 86400;

/** Short lock during active send attempt — prevents concurrent race */
const SEND_LOCK_TTL_SECONDS = 30;

// ── Phone Normalization ──────────────────────────────────────────────────────

/**
 * Normalizes a Jordanian mobile phone number to E.164 format (+962XXXXXXXX).
 *
 * Supported input formats:
 *   0791234567   → +962791234567
 *   791234567    → +962791234567
 *   +962791234567 → +962791234567 (passthrough)
 *   00962791234567 → +962791234567
 *
 * Returns null if the number cannot be normalized or fails validation.
 */
export function normalizeJordanianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Strip all whitespace, dashes, parentheses
  let cleaned = raw.replace(/[\s\-().]/g, "").trim();

  // Remove leading +
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  // Remove leading 00
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);

  // Now cleaned should be one of:
  //   962XXXXXXXX  (international without +)
  //   0XXXXXXXXX   (local with leading 0)
  //   XXXXXXXXX    (7-digit local, no leading 0)

  if (cleaned.startsWith("962")) {
    // Already has country code
    const local = cleaned.slice(3); // remove 962
    if (!isValidJordanianLocal(local)) return null;
    return `+962${local}`;
  }

  if (cleaned.startsWith("0")) {
    const local = cleaned.slice(1); // remove leading 0
    if (!isValidJordanianLocal(local)) return null;
    return `+962${local}`;
  }

  // Assume bare local number (9 digits starting with 7)
  if (isValidJordanianLocal(cleaned)) {
    return `+962${cleaned}`;
  }

  return null;
}

/**
 * Validates a Jordanian mobile local number (9 digits, starting with 7).
 * Jordanian mobile prefixes: 77, 78, 79
 */
function isValidJordanianLocal(local: string): boolean {
  return /^7[789]\d{7}$/.test(local);
}

/**
 * Returns a masked version of a phone number safe for logs and UI display.
 * +962797683960 → +962797***960
 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return "****";
  if (phone.length >= 12) {
    return `${phone.slice(0, 7)}***${phone.slice(-3)}`;
  }
  return `${phone.slice(0, 6)}****${phone.slice(-3)}`;
}

// ── D7 API Client ────────────────────────────────────────────────────────────

interface D7SendResult {
  success: boolean;
  requestId?: string;
  /** Error description (safe for server logs, no secrets) */
  error?: string;
  /** True for non-retryable errors (401 auth, 422 invalid phone, etc.) */
  permanent?: boolean;
  httpStatus?: number;
}

/**
 * Sends a single SMS via D7 Networks API.
 *
 * Handles:
 *  - Authorization header (server-side only)
 *  - Arabic Unicode encoding (`data_coding: "unicode"`)
 *  - 2 controlled retries with backoff for transient 5xx / network errors
 *  - Permanent error detection (401, 402, 422) — no retry for these
 *
 * Returns a result object, NEVER throws.
 */
async function sendSmsViaD7(phone: string, content: string): Promise<D7SendResult> {
  const token = process.env.D7_API_TOKEN;
  const senderId = process.env.D7_ORIGINATOR || process.env.D7_SENDER_ID || "UltraGym";

  if (!token) {
    console.error("[SMS] D7_API_TOKEN is not configured");
    return { success: false, error: "D7_API_TOKEN not configured", permanent: true };
  }

  const body = JSON.stringify({
    messages: [
      {
        channel: "sms",
        recipients: [phone],
        content,
        msg_type: "text",
        data_coding: "unicode", // Required for Arabic text
      },
    ],
    message_globals: {
      originator: senderId,
    },
  });

  const MAX_RETRIES = 2;
  const BACKOFF_MS = [500, 1500];

  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]));
    }

    try {
      const res = await fetch(D7_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
        // 10-second timeout via AbortController
        signal: AbortSignal.timeout(10000),
      });

      lastStatus = res.status;

      if (res.ok) {
        const data = (await res.json()) as { request_id?: string; status?: string };
        if (data.status === "accepted" || data.request_id) {
          return { success: true, requestId: data.request_id, httpStatus: res.status };
        }
        // D7 returned 200 but status !== "accepted"
        return {
          success: false,
          error: `D7 returned status: ${data.status}`,
          httpStatus: res.status,
          permanent: false,
        };
      }

      // Permanent errors — do not retry
      if (res.status === 401 || res.status === 402 || res.status === 422) {
        let detail = "";
        try {
          const errData = await res.json();
          detail = JSON.stringify(errData).slice(0, 200);
        } catch {
          detail = `HTTP ${res.status}`;
        }
        await incrementD7ApiError();
        return {
          success: false,
          error: `D7 permanent error ${res.status}: ${detail}`,
          permanent: true,
          httpStatus: res.status,
        };
      }

      // Transient errors (5xx, 429) — retry
      lastError = `HTTP ${res.status}`;
      await incrementD7ApiError();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Network/timeout errors are retryable
    }
  }

  return {
    success: false,
    error: `D7 failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
    httpStatus: lastStatus,
    permanent: false,
  };
}

// ── SMS Enabled Guard ─────────────────────────────────────────────────────────

function isSmsEnabled(): boolean {
  return process.env.D7_SMS_ENABLED !== "false";
}

// ── Idempotency Helpers ───────────────────────────────────────────────────────

/**
 * Atomically acquires a send-once idempotency slot.
 * Returns true if this execution may proceed to send.
 * Returns false if another execution already sent or is sending.
 */
async function acquireIdempotencySlot(key: string): Promise<boolean> {
  if (!isRedisConfigured) {
    // In-memory fallback: use the memoryCache via setInRedis with NX behavior
    // The memoryFallback in redisClient.ts supports nx flag
    const existing = await getFromRedis<string>(key);
    if (existing) return false;
    await setInRedis(key, "sending", SEND_LOCK_TTL_SECONDS);
    return true;
  }
  try {
    const result = await redis.set(key, "sending", {
      nx: true,
      ex: SEND_LOCK_TTL_SECONDS,
    });
    return result === "OK";
  } catch {
    // Redis error: allow send (fail-open) to not block SMS
    return true;
  }
}

/**
 * Marks the idempotency key as permanently sent with long TTL.
 * Called AFTER D7 successfully accepts the message.
 */
async function markAsSent(key: string): Promise<void> {
  await setInRedis(key, "sent", IDEMPOTENCY_TTL_SECONDS);
}

/**
 * Releases the short-lived send lock (if D7 failed, allow retry later).
 */
async function releaseSendLock(key: string): Promise<void> {
  // Only delete if still "sending" (not already overwritten by markAsSent)
  try {
    const current = await getFromRedis<string>(key);
    if (current === "sending") {
      if (isRedisConfigured) {
        await redis.del(key);
      }
    }
  } catch {
    // Ignore — worst case the lock expires naturally (SEND_LOCK_TTL_SECONDS)
  }
}

// ── App URL Helper ────────────────────────────────────────────────────────────

function getAppUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://ultra-gym.netlify.app"
  );
}

// ── Public Send Functions ─────────────────────────────────────────────────────

export interface RegistrationSmsParams {
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  /** Email used as login identifier (preferred) */
  email?: string | null;
  /** Temporary plain-text password — NEVER log this */
  temporaryPassword: string;
}

/**
 * Sends a welcome SMS to a newly registered member.
 *
 * Idempotency key: sms:idempotency:registration:{memberId}
 * Only sends ONCE per member (per memberId), regardless of retries.
 *
 * This function NEVER throws. D7 failure is logged but does not
 * propagate — member registration succeeds regardless of SMS result.
 */
export async function sendRegistrationSms(params: RegistrationSmsParams): Promise<{
  sent: boolean;
  skipped?: string;
  requestId?: string;
  error?: string;
}> {
  const { memberId, memberName, phone, email, temporaryPassword } = params;

  if (!isSmsEnabled()) {
    console.log(`[SMS] Registration SMS disabled (D7_SMS_ENABLED=false) for member ${memberId}`);
    await incrementSmsSkipped("disabled");
    return { sent: false, skipped: "sms_disabled" };
  }

  // Normalize phone
  const normalizedPhone = normalizeJordanianPhone(phone);
  if (!normalizedPhone) {
    console.warn(`[SMS] Registration: invalid phone for member ${memberId} — skipping`);
    await incrementSmsSkipped("invalid_phone");
    await recordSmsStatus({
      event: "registration",
      status: "skipped",
      provider: "d7",
      memberId,
      reason: "invalid_phone",
    });
    return { sent: false, skipped: "invalid_phone" };
  }

  // Determine login username: email preferred, then normalized phone
  const loginUsername = email?.trim() || normalizedPhone;

  // Idempotency check
  const idempotencyKey = `sms:idempotency:registration:${memberId}`;
  const alreadySent = await getFromRedis<string>(idempotencyKey);
  if (alreadySent === "sent") {
    console.log(`[SMS] Registration already sent for member ${memberId} — skipping`);
    await incrementSmsSkipped("duplicate_prevented");
    return { sent: false, skipped: "already_sent" };
  }

  const acquired = await acquireIdempotencySlot(idempotencyKey);
  if (!acquired) {
    console.log(`[SMS] Registration send in progress for member ${memberId} — skipping`);
    await incrementSmsSkipped("duplicate_prevented");
    return { sent: false, skipped: "send_in_progress" };
  }

  // Build message (kept short to minimize segments)
  const appUrl = getAppUrl();
  const content = [
    `أهلاً ${memberName}`,
    `تم تسجيلك في Nasaq Gym بنجاح`,
    `الدخول: ${loginUsername}`,
    `كلمة المرور: ${temporaryPassword}`,
    appUrl,
  ].join("\n");

  try {
    const result = await sendSmsViaD7(normalizedPhone, content);

    if (result.success) {
      await markAsSent(idempotencyKey);
      await incrementSmsSent("registration");
      await recordSmsStatus({
        event: "registration",
        status: "sent",
        provider: "d7",
        memberId,
        providerMessageId: result.requestId,
      });
      console.log(
        `[SMS] Registration SMS accepted by D7 for member ${memberId} (${maskPhone(normalizedPhone)}) — requestId: ${result.requestId}`
      );
      return { sent: true, requestId: result.requestId };
    } else {
      await releaseSendLock(idempotencyKey);
      await incrementSmsFailed("registration");
      await recordSmsStatus({
        event: "registration",
        status: result.permanent ? "failed_permanent" : "failed",
        provider: "d7",
        memberId,
        error: result.error,
      });
      console.error(
        `[SMS] Registration SMS failed for member ${memberId} (${maskPhone(normalizedPhone)}): ${result.error}`
      );
      return { sent: false, error: result.error };
    }
  } catch (err) {
    // Absolute safety net — SMS must never crash registration
    await releaseSendLock(idempotencyKey);
    await incrementSmsFailed("registration");
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Unexpected error in sendRegistrationSms for ${memberId}:`, errMsg);
    return { sent: false, error: errMsg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface RenewalSmsParams {
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  subscriptionId: string;
  /** ISO date string e.g. "2026-09-30" */
  newExpiryDate: string;
}

/**
 * Sends a subscription renewal confirmation SMS.
 *
 * Idempotency key: sms:idempotency:renewal:{subscriptionId}:{newExpiryDate}
 * A new SMS is allowed for each unique (subscriptionId, newExpiryDate) pair,
 * enabling correct behavior for multiple legitimate renewals.
 *
 * This function NEVER throws.
 */
export async function sendRenewalSms(params: RenewalSmsParams): Promise<{
  sent: boolean;
  skipped?: string;
  requestId?: string;
  error?: string;
}> {
  const { memberId, memberName, phone, subscriptionId, newExpiryDate } = params;

  if (!isSmsEnabled()) {
    await incrementSmsSkipped("disabled");
    return { sent: false, skipped: "sms_disabled" };
  }

  const normalizedPhone = normalizeJordanianPhone(phone);
  if (!normalizedPhone) {
    console.warn(`[SMS] Renewal: invalid phone for member ${memberId} — skipping`);
    await incrementSmsSkipped("invalid_phone");
    await recordSmsStatus({
      event: "renewal",
      status: "skipped",
      provider: "d7",
      memberId,
      reason: "invalid_phone",
    });
    return { sent: false, skipped: "invalid_phone" };
  }

  // Idempotency: unique per subscription + new expiry date
  // This allows future renewals (with new expiry dates) to send new SMS
  const idempotencyKey = `sms:idempotency:renewal:${subscriptionId}:${newExpiryDate}`;
  const alreadySent = await getFromRedis<string>(idempotencyKey);
  if (alreadySent === "sent") {
    await incrementSmsSkipped("duplicate_prevented");
    return { sent: false, skipped: "already_sent" };
  }

  const acquired = await acquireIdempotencySlot(idempotencyKey);
  if (!acquired) {
    await incrementSmsSkipped("duplicate_prevented");
    return { sent: false, skipped: "send_in_progress" };
  }

  // Format expiry date in Arabic-friendly format
  const formattedExpiry = formatDateArabic(newExpiryDate);

  const content = [
    `أهلاً ${memberName}`,
    `تم تجديد اشتراك Nasaq Gym.`,
    `الانتهاء الجديد: ${formattedExpiry}`,
  ].join("\n");

  try {
    const result = await sendSmsViaD7(normalizedPhone, content);

    if (result.success) {
      await markAsSent(idempotencyKey);
      await incrementSmsSent("renewal");
      await recordSmsStatus({
        event: "renewal",
        status: "sent",
        provider: "d7",
        memberId,
        providerMessageId: result.requestId,
      });
      console.log(
        `[SMS] Renewal SMS accepted for member ${memberId} (${maskPhone(normalizedPhone)}) sub ${subscriptionId} → expiry ${newExpiryDate}`
      );
      return { sent: true, requestId: result.requestId };
    } else {
      await releaseSendLock(idempotencyKey);
      await incrementSmsFailed("renewal");
      await recordSmsStatus({
        event: "renewal",
        status: result.permanent ? "failed_permanent" : "failed",
        provider: "d7",
        memberId,
        error: result.error,
      });
      console.error(
        `[SMS] Renewal SMS failed for member ${memberId}: ${result.error}`
      );
      return { sent: false, error: result.error };
    }
  } catch (err) {
    await releaseSendLock(idempotencyKey);
    await incrementSmsFailed("renewal");
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Unexpected error in sendRenewalSms for ${memberId}:`, errMsg);
    return { sent: false, error: errMsg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ExpirationSmsParams {
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  subscriptionId: string;
  /** ISO date string e.g. "2026-08-31" */
  expiryDate: string;
}

/**
 * Sends a subscription expiration notification SMS.
 *
 * Idempotency key: sms:idempotency:expiration:{subscriptionId}:{expiryDate}
 * Sends EXACTLY ONCE per subscription expiration, regardless of how many
 * times the expiration cron worker runs.
 *
 * This function NEVER throws.
 */
export async function sendExpirationSms(params: ExpirationSmsParams): Promise<{
  sent: boolean;
  skipped?: string;
  requestId?: string;
  error?: string;
}> {
  const { memberId, memberName, phone, subscriptionId, expiryDate } = params;

  if (!isSmsEnabled()) {
    await incrementSmsSkipped("disabled");
    return { sent: false, skipped: "sms_disabled" };
  }

  const normalizedPhone = normalizeJordanianPhone(phone);
  if (!normalizedPhone) {
    console.warn(`[SMS] Expiration: invalid phone for member ${memberId} sub ${subscriptionId} — skipping`);
    await incrementSmsSkipped("invalid_phone");
    await recordSmsStatus({
      event: "expiration",
      status: "skipped",
      provider: "d7",
      memberId,
      reason: "invalid_phone",
    });
    return { sent: false, skipped: "invalid_phone" };
  }

  const idempotencyKey = `sms:idempotency:expiration:${subscriptionId}:${expiryDate}`;
  const alreadySent = await getFromRedis<string>(idempotencyKey);
  if (alreadySent === "sent") {
    // Already sent — this is normal when cron runs multiple times
    return { sent: false, skipped: "already_sent" };
  }

  const acquired = await acquireIdempotencySlot(idempotencyKey);
  if (!acquired) {
    return { sent: false, skipped: "send_in_progress" };
  }

  const formattedExpiry = formatDateArabic(expiryDate);

  const content = [
    `أهلاً ${memberName}`,
    `انتهى اشتراك Nasaq Gym بتاريخ ${formattedExpiry}.`,
    `يسعدنا تجديد اشتراكك والعودة للتمرين.`,
  ].join("\n");

  try {
    const result = await sendSmsViaD7(normalizedPhone, content);

    if (result.success) {
      await markAsSent(idempotencyKey);
      await incrementSmsSent("expiration");
      await recordSmsStatus({
        event: "expiration",
        status: "sent",
        provider: "d7",
        memberId,
        providerMessageId: result.requestId,
      });
      console.log(
        `[SMS] Expiration SMS accepted for member ${memberId} sub ${subscriptionId} (${maskPhone(normalizedPhone)})`
      );
      return { sent: true, requestId: result.requestId };
    } else {
      await releaseSendLock(idempotencyKey);
      await incrementSmsFailed("expiration");
      await recordSmsStatus({
        event: "expiration",
        status: result.permanent ? "failed_permanent" : "failed",
        provider: "d7",
        memberId,
        error: result.error,
      });
      console.error(
        `[SMS] Expiration SMS failed for member ${memberId} sub ${subscriptionId}: ${result.error}`
      );
      return { sent: false, error: result.error };
    }
  } catch (err) {
    await releaseSendLock(idempotencyKey);
    await incrementSmsFailed("expiration");
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Unexpected error in sendExpirationSms for ${memberId}:`, errMsg);
    return { sent: false, error: errMsg };
  }
}

// ── Date Formatting ───────────────────────────────────────────────────────────

/**
 * Formats an ISO date string (YYYY-MM-DD) into a human-friendly Arabic date.
 * e.g. "2026-09-30" → "٣٠ سبتمبر ٢٠٢٦"
 */
function formatDateArabic(isoDate: string): string {
  try {
    const date = new Date(isoDate + "T00:00:00");
    return date.toLocaleDateString("ar-JO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoDate; // Fallback to ISO string
  }
}

// ── Controlled Direct Test SMS ────────────────────────────────────────────────

export interface DirectTestSmsParams {
  phone: string;
  message: string;
}

export interface DirectTestSmsResult {
  sent: boolean;
  d7Accepted: boolean;
  httpStatus?: number;
  requestId?: string;
  error?: string;
  duplicateBlocked?: boolean;
  destinationMasked: string;
  normalizedPhone: string | null;
  senderId: string;
  timestamp: string;
}

/**
 * Sends a single controlled direct test SMS to verify D7 connectivity.
 * Protected with a short-lived Redis idempotency key to prevent accidental duplicate sends.
 * Uses ZERO Airtable operations (0 reads, 0 writes).
 */
export async function sendDirectTestSms(params: DirectTestSmsParams): Promise<DirectTestSmsResult> {
  const { phone, message } = params;
  const normalizedPhone = normalizeJordanianPhone(phone);
  const destinationMasked = normalizedPhone ? maskPhone(normalizedPhone) : (phone ? maskPhone(phone) : "—");
  const senderId = process.env.D7_SENDER_ID || "UltraGym";
  const timestamp = new Date().toISOString();

  if (!isSmsEnabled()) {
    await incrementSmsSkipped("disabled");
    return {
      sent: false,
      d7Accepted: false,
      error: "D7_SMS_ENABLED is set to false",
      destinationMasked,
      normalizedPhone,
      senderId,
      timestamp,
    };
  }

  if (!normalizedPhone) {
    await incrementSmsSkipped("invalid_phone");
    return {
      sent: false,
      d7Accepted: false,
      error: "Invalid Jordanian phone number format",
      destinationMasked,
      normalizedPhone: null,
      senderId,
      timestamp,
    };
  }

  // Temporary Redis idempotency key to block accidental immediate re-sends (5 minutes TTL)
  const testIdempotencyKey = `ultra-gym:sms:test:${normalizedPhone}`;
  const existing = await getFromRedis<string>(testIdempotencyKey);

  if (existing === "sent") {
    await incrementSmsSkipped("duplicate_prevented");
    return {
      sent: false,
      d7Accepted: false,
      duplicateBlocked: true,
      error: "TEST SMS RECENTLY SENT — DUPLICATE BLOCKED",
      destinationMasked,
      normalizedPhone,
      senderId,
      timestamp,
    };
  }

  try {
    const result = await sendSmsViaD7(normalizedPhone, message);

    if (result.success) {
      // Mark as sent for 5 minutes (300 seconds) to prevent duplicate test sends
      await setInRedis(testIdempotencyKey, "sent", 300);
      await incrementSmsSent("test");
      await recordSmsStatus({
        event: "test",
        status: "sent",
        provider: "d7",
        providerMessageId: result.requestId,
      });

      return {
        sent: true,
        d7Accepted: true,
        httpStatus: result.httpStatus ?? 200,
        requestId: result.requestId,
        destinationMasked,
        normalizedPhone,
        senderId,
        timestamp,
      };
    } else {
      await incrementSmsFailed("test");
      await recordSmsStatus({
        event: "test",
        status: result.permanent ? "failed_permanent" : "failed",
        provider: "d7",
        error: result.error,
      });

      return {
        sent: false,
        d7Accepted: false,
        httpStatus: result.httpStatus,
        error: result.error,
        destinationMasked,
        normalizedPhone,
        senderId,
        timestamp,
      };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await incrementSmsFailed("test");
    return {
      sent: false,
      d7Accepted: false,
      error: errMsg,
      destinationMasked,
      normalizedPhone,
      senderId,
      timestamp,
    };
  }
}

// ── Welcome SMS Helper / Alias ──────────────────────────────────────────────

export async function sendWelcomeSms(member: {
  id?: string;
  memberId?: string;
  name?: string;
  memberName?: string;
  phone?: string | null;
  email?: string | null;
  temporaryPassword?: string;
  password?: string;
}) {
  return sendRegistrationSms({
    memberId: member.memberId || member.id || `mem_${Date.now()}`,
    memberName: member.memberName || member.name || "المشترك",
    phone: member.phone,
    email: member.email,
    temporaryPassword: member.temporaryPassword || member.password || "UltraGym@2026",
  });
}

// ── Expiring Subscription Warning SMS ───────────────────────────────────────

export interface ExpiringSmsParams {
  memberId: string;
  memberName: string;
  phone: string | null | undefined;
  subscriptionId: string;
  daysRemaining: number;
  expiryDate: string;
  planName?: string;
}

export async function sendExpiringSms(params: ExpiringSmsParams): Promise<{
  sent: boolean;
  skipped?: string;
  requestId?: string;
  error?: string;
}> {
  const { memberId, memberName, phone, subscriptionId, daysRemaining, expiryDate, planName } = params;

  if (!isSmsEnabled()) {
    await incrementSmsSkipped("disabled");
    return { sent: false, skipped: "sms_disabled" };
  }

  const normalizedPhone = normalizeJordanianPhone(phone);
  if (!normalizedPhone) {
    console.warn(`[SMS] Expiring: invalid phone for member ${memberId} — skipping`);
    await incrementSmsSkipped("invalid_phone");
    return { sent: false, skipped: "invalid_phone" };
  }

  const idempotencyKey = `sms:idempotency:expiring:${subscriptionId}:${expiryDate}:${daysRemaining}`;
  const alreadySent = await getFromRedis<string>(idempotencyKey);
  if (alreadySent === "sent") {
    return { sent: false, skipped: "already_sent" };
  }

  const acquired = await acquireIdempotencySlot(idempotencyKey);
  if (!acquired) {
    return { sent: false, skipped: "send_in_progress" };
  }

  const formattedExpiry = formatDateArabic(expiryDate);
  const planTxt = planName ? ` (${planName})` : "";
  const daysTxt = daysRemaining === 1 ? "يوم واحد فقط" : daysRemaining === 2 ? "يومين" : `${daysRemaining} أيام`;

  const content = [
    `مرحباً ${memberName} 👋`,
    `نود تذكيرك بأن اشتراكك${planTxt} ينتهي خلال ${daysTxt} (${formattedExpiry}).`,
    `يسعدنا تجديد اشتراكك لمواصلة تمارينك دون انقطاع 💪`,
    getAppUrl(),
  ].join("\n");

  try {
    const result = await sendSmsViaD7(normalizedPhone, content);
    if (result.success) {
      await markAsSent(idempotencyKey);
      await incrementSmsSent("expiration");
      await recordSmsStatus({
        event: "expiring",
        status: "sent",
        provider: "d7",
        memberId,
        providerMessageId: result.requestId,
      });
      return { sent: true, requestId: result.requestId };
    } else {
      await releaseSendLock(idempotencyKey);
      await incrementSmsFailed("expiration");
      return { sent: false, error: result.error };
    }
  } catch (err) {
    await releaseSendLock(idempotencyKey);
    await incrementSmsFailed("expiration");
    const errMsg = err instanceof Error ? err.message : String(err);
    return { sent: false, error: errMsg };
  }
}

// ── Expired Subscription Alias ──────────────────────────────────────────────

export async function sendExpiredSms(params: ExpirationSmsParams) {
  return sendExpirationSms(params);
}

// ── Custom Admin Direct SMS ──────────────────────────────────────────────────

export interface CustomSmsParams {
  memberId?: string;
  memberName?: string;
  phone: string | null | undefined;
  message: string;
  planName?: string;
  daysLeft?: number;
  endDate?: string;
  bypassIdempotency?: boolean;
}

export async function sendCustomSms(params: CustomSmsParams): Promise<{
  sent: boolean;
  skipped?: string;
  requestId?: string;
  error?: string;
  destinationMasked: string;
  normalizedPhone: string | null;
}> {
  const { memberId, memberName = "كابتن", phone, message, planName = "الاشتراك", daysLeft = 0, endDate = "", bypassIdempotency = false } = params;

  const normalizedPhone = normalizeJordanianPhone(phone);
  const destinationMasked = normalizedPhone ? maskPhone(normalizedPhone) : (phone ? maskPhone(phone) : "—");

  if (!isSmsEnabled()) {
    await incrementSmsSkipped("disabled");
    return { sent: false, skipped: "sms_disabled", destinationMasked, normalizedPhone };
  }

  if (!normalizedPhone) {
    await incrementSmsSkipped("invalid_phone");
    return { sent: false, skipped: "invalid_phone", error: "رقم الهاتف غير صالح", destinationMasked, normalizedPhone: null };
  }

  // Resolve dynamic template variables
  const resolvedContent = message
    .replace(/\{name\}|\{\{name\}\}/gi, memberName)
    .replace(/\{plan\}|\{\{plan\}\}|\{package\}|\{\{package\}\}/gi, planName)
    .replace(/\{days\}|\{\{days\}\}|\{daysLeft\}|\{\{daysLeft\}\}/gi, String(daysLeft))
    .replace(/\{endDate\}|\{\{endDate\}\}/gi, endDate ? formatDateArabic(endDate) : "");

  const idempotencyKey = `sms:idempotency:custom:${memberId || normalizedPhone}:${Date.now()}`;
  if (!bypassIdempotency) {
    const acquired = await acquireIdempotencySlot(idempotencyKey);
    if (!acquired) {
      return { sent: false, skipped: "send_in_progress", destinationMasked, normalizedPhone };
    }
  }

  try {
    const result = await sendSmsViaD7(normalizedPhone, resolvedContent);
    if (result.success) {
      if (!bypassIdempotency) await markAsSent(idempotencyKey);
      await incrementSmsSent("test");
      await recordSmsStatus({
        event: "custom",
        status: "sent",
        provider: "d7",
        memberId,
        providerMessageId: result.requestId,
      });
      return { sent: true, requestId: result.requestId, destinationMasked, normalizedPhone };
    } else {
      if (!bypassIdempotency) await releaseSendLock(idempotencyKey);
      await incrementSmsFailed("test");
      await recordSmsStatus({
        event: "custom",
        status: result.permanent ? "failed_permanent" : "failed",
        provider: "d7",
        memberId,
        error: result.error,
      });
      return { sent: false, error: result.error, destinationMasked, normalizedPhone };
    }
  } catch (err) {
    if (!bypassIdempotency) await releaseSendLock(idempotencyKey);
    await incrementSmsFailed("test");
    const errMsg = err instanceof Error ? err.message : String(err);
    return { sent: false, error: errMsg, destinationMasked, normalizedPhone };
  }
}


