/**
 * Ultra Gym — Redis Payment Store & Multi-Layer Idempotency Guard
 *
 * Manages:
 *  1. Temporary payment transaction state in Redis (24h TTL)
 *  2. Anti-double-click creation lock (60s TTL)
 *  3. Single-fulfillment renewal idempotency lock (365 days TTL)
 *
 * ZERO Airtable reads/writes occur in this store.
 */

import {
  getFromRedis,
  setInRedis,
  deleteFromRedis,
  acquireLock,
  isRedisConfigured,
  redis,
} from "@/lib/redisClient";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PaymentTransactionRecord {
  paymentRef: string; // cart_id
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string | null;
  planId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  provider?: "mock" | "paytabs" | "myfatoorah";
  tranRef?: string;
  cartId?: string;
  invoiceId?: number;
  paymentUrl?: string;
  createdAt: number;
  paidAt?: number;
  renewedAt?: number;
  newSubEndDate?: string;
  error?: string;
}

// ── Keys & TTLs ──────────────────────────────────────────────────────────────

const PAYMENT_TX_PREFIX = "ultra-gym:payment:tx:";
const CREATION_LOCK_PREFIX = "ultra-gym:payment:lock:create:";
const RENEWAL_LOCK_PREFIX = "ultra-gym:payment:renewed:";

const TX_TTL_SECONDS = 86400; // 24 hours
const CREATION_LOCK_TTL = 30; // 30 seconds
const RENEWAL_IDEMPOTENCY_TTL = 365 * 86400; // 1 year

// ── Transaction State Management ─────────────────────────────────────────────

/**
 * Saves a payment transaction state in Redis.
 */
export async function savePaymentTransaction(
  tx: PaymentTransactionRecord
): Promise<void> {
  const key = `${PAYMENT_TX_PREFIX}${tx.paymentRef}`;
  await setInRedis(key, tx, TX_TTL_SECONDS);

  // Map tranRef -> paymentRef for fast lookups
  if (tx.tranRef) {
    const tranMapKey = `ultra-gym:payment:tran-map:${tx.tranRef}`;
    await setInRedis(tranMapKey, tx.paymentRef, TX_TTL_SECONDS);
  }

  // Also map invoiceId -> paymentRef if invoiceId is known
  if (tx.invoiceId) {
    const invoiceMapKey = `ultra-gym:payment:invoice-map:${tx.invoiceId}`;
    await setInRedis(invoiceMapKey, tx.paymentRef, TX_TTL_SECONDS);
  }
}

/**
 * Retrieves a payment transaction by payment reference (cart_id).
 */
export async function getPaymentTransaction(
  paymentRef: string
): Promise<PaymentTransactionRecord | null> {
  const key = `${PAYMENT_TX_PREFIX}${paymentRef}`;
  return await getFromRedis<PaymentTransactionRecord>(key);
}

/**
 * Retrieves a payment transaction by PayTabs transaction reference (tranRef).
 */
export async function getPaymentTransactionByTranRef(
  tranRef: string
): Promise<PaymentTransactionRecord | null> {
  const tranMapKey = `ultra-gym:payment:tran-map:${tranRef}`;
  const paymentRef = await getFromRedis<string>(tranMapKey);
  if (!paymentRef) return null;
  return await getPaymentTransaction(paymentRef);
}

/**
 * Retrieves a payment transaction by MyFatoorah invoice ID.
 */
export async function getPaymentTransactionByInvoiceId(
  invoiceId: number | string
): Promise<PaymentTransactionRecord | null> {
  const invoiceMapKey = `ultra-gym:payment:invoice-map:${invoiceId}`;
  const paymentRef = await getFromRedis<string>(invoiceMapKey);
  if (!paymentRef) return null;
  return await getPaymentTransaction(paymentRef);
}

// ── Multi-Layer Idempotency Guards ───────────────────────────────────────────

/**
 * Prevents double payment invoice creation from quick double-clicks.
 * Returns true if lock was acquired, false if a creation is already in flight.
 */
export async function acquirePaymentCreationLock(
  memberId: string,
  planId: string
): Promise<boolean> {
  const lockKey = `${CREATION_LOCK_PREFIX}${memberId}:${planId}`;
  const token = `token_${Date.now()}`;
  return await acquireLock(lockKey, token, CREATION_LOCK_TTL);
}

/**
 * Releases the creation lock early if creation failed.
 */
export async function releasePaymentCreationLock(
  memberId: string,
  planId: string
): Promise<void> {
  const lockKey = `${CREATION_LOCK_PREFIX}${memberId}:${planId}`;
  await deleteFromRedis(lockKey);
}

/**
 * Atomically checks and locks a payment for renewal fulfillment.
 * Ensures that if BOTH callback and webhook arrive, or the user refreshes
 * the return page 10 times, the subscription is renewed EXACTLY ONCE.
 *
 * Returns true if this process is the FIRST to claim fulfillment.
 * Returns false if the payment was ALREADY renewed.
 */
export async function acquireRenewalFulfillmentLock(
  invoiceIdOrPaymentRef: string | number
): Promise<boolean> {
  const lockKey = `${RENEWAL_LOCK_PREFIX}${invoiceIdOrPaymentRef}`;

  if (!isRedisConfigured) {
    const existing = await getFromRedis<string>(lockKey);
    if (existing) return false;
    await setInRedis(lockKey, "renewed", RENEWAL_IDEMPOTENCY_TTL);
    return true;
  }

  try {
    const res = await redis.set(lockKey, "renewed", {
      nx: true,
      ex: RENEWAL_IDEMPOTENCY_TTL,
    });
    return res === "OK";
  } catch (err) {
    console.warn("[PaymentStore] Error acquiring renewal fulfillment lock:", err);
    // Fallback: check if key exists
    const existing = await getFromRedis<string>(lockKey);
    if (existing) return false;
    await setInRedis(lockKey, "renewed", RENEWAL_IDEMPOTENCY_TTL);
    return true;
  }
}

/**
 * Checks whether an invoice/payment has already been fulfilled.
 */
export async function isPaymentAlreadyFulfilled(
  invoiceIdOrPaymentRef: string | number
): Promise<boolean> {
  const lockKey = `${RENEWAL_LOCK_PREFIX}${invoiceIdOrPaymentRef}`;
  const status = await getFromRedis<string>(lockKey);
  return status === "renewed";
}
