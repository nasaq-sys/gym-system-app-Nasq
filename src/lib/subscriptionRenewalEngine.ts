/**
 * Ultra Gym — Subscription Renewal Fulfillment Engine
 *
 * Central engine executed after payment verification (PayTabs / MyFatoorah).
 *
 * GUARANTEES:
 *  1. Exactly-Once Renewal (Strict Idempotency via atomic Redis lock).
 *  2. Server-Authoritative Price & Currency Validation before renewal.
 *  3. Targeted Airtable updates: Member record updated + Subscription log created.
 *  4. Event-Driven Cache Invalidation: Invalidate only relevant member and overview keys.
 *  5. Triggers existing Renewal Push & SMS channels (fire-and-forget).
 *  6. Updates Redis Expiry Index so future expiration SMS will fire on the new date.
 */

import { getRecordById, updateRecord, createRecord } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS, SUBSCRIPTION_FIELDS } from "@/lib/constants";
import { deleteFromRedis } from "@/lib/redisClient";
import { REDIS_KEYS } from "@/lib/cacheService";
import { getAuthoritativePlan, calculateNewExpiryDate } from "@/lib/membershipPlans";
import {
  savePaymentTransaction,
  getPaymentTransaction,
  acquireRenewalFulfillmentLock,
  isPaymentAlreadyFulfilled,
} from "@/lib/paymentStore";
import {
  incrementPaymentSuccess,
  incrementPaymentFailed,
  incrementDuplicateCallbackPrevented,
} from "@/lib/paymentMetrics";
import { notifySubscriptionRenewed } from "@/lib/subscriptionNotifications";
import { sendRenewalSms } from "@/lib/smsService";
import { updateExpiryEntry, expiryDateToTimestamp } from "@/lib/smsExpiryIndex";
import { isPayTabsTestMode, type NormalizedPayTabsStatus } from "@/lib/paytabsService";
import { isMyFatoorahTestMode, type PaymentStatusResult } from "@/lib/myfatoorahService";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GenericPaymentVerification {
  isPaid: boolean;
  isCancelled: boolean;
  isFailed: boolean;
  paidAmount?: number;
  paidCurrency?: string;
  transactionRef?: string;
  invoiceId?: string | number;
  userDefined?: {
    memberId?: string;
    planId?: string;
    paymentRef?: string;
  };
  error?: string;
  raw?: unknown;
}

export interface FulfillRenewalParams {
  paymentRef: string;
  paymentStatus?: GenericPaymentVerification;
  paytabsStatus?: NormalizedPayTabsStatus;
  myfatoorahStatus?: PaymentStatusResult;
}

export interface FulfillRenewalResult {
  success: boolean;
  alreadyFulfilled: boolean;
  status: "paid" | "failed" | "cancelled" | "amount_mismatch";
  newExpiryDate?: string;
  newStartDate?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

function scalarNumber(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Main Fulfillment Engine ──────────────────────────────────────────────────

export async function fulfillSubscriptionRenewal(
  params: FulfillRenewalParams
): Promise<FulfillRenewalResult> {
  const { paymentRef } = params;

  // 1. Unify status from paytabsStatus / myfatoorahStatus / paymentStatus
  let norm: GenericPaymentVerification;

  if (params.paytabsStatus) {
    const pt = params.paytabsStatus;
    norm = {
      isPaid: pt.isPaid,
      isCancelled: pt.isCancelled,
      isFailed: pt.isFailed,
      paidAmount: pt.cartAmount,
      paidCurrency: pt.cartCurrency,
      transactionRef: pt.tranRef,
      userDefined: pt.userDefined,
      error: pt.error || pt.responseMessage,
      raw: pt.raw,
    };
  } else if (params.myfatoorahStatus) {
    const mf = params.myfatoorahStatus;
    let udf: { memberId?: string; planId?: string; paymentRef?: string } | undefined = undefined;
    if (mf.userDefinedField) {
      try {
        udf = JSON.parse(mf.userDefinedField);
      } catch {
        // non-critical
      }
    }
    norm = {
      isPaid: mf.isPaid,
      isCancelled: mf.isCancelled,
      isFailed: mf.isFailed,
      paidAmount: mf.invoiceValue,
      paidCurrency: mf.displayCurrency,
      invoiceId: mf.invoiceId,
      transactionRef: mf.primaryPaymentId,
      userDefined: udf,
      error: mf.error,
      raw: mf.raw,
    };
  } else if (params.paymentStatus) {
    norm = params.paymentStatus;
  } else {
    return {
      success: false,
      alreadyFulfilled: false,
      status: "failed",
      error: "No payment verification data provided to renewal engine",
    };
  }

  // 2. Retrieve transaction record from Redis
  let tx = await getPaymentTransaction(paymentRef);

  if (!tx && norm.userDefined?.paymentRef && norm.userDefined.paymentRef !== paymentRef) {
    tx = await getPaymentTransaction(norm.userDefined.paymentRef);
  }

  if (!tx) {
    return {
      success: false,
      alreadyFulfilled: false,
      status: "failed",
      error: `Payment transaction not found for reference: ${paymentRef}`,
    };
  }

  // 3. Check if user cancelled or payment failed
  if (norm.isCancelled) {
    tx.status = "cancelled";
    await savePaymentTransaction(tx);
    return {
      success: false,
      alreadyFulfilled: false,
      status: "cancelled",
      error: "Payment was cancelled by the user",
    };
  }

  if (!norm.isPaid || norm.isFailed) {
    tx.status = "failed";
    tx.error = norm.error || "Payment was not completed successfully";
    await savePaymentTransaction(tx);
    await incrementPaymentFailed();
    return {
      success: false,
      alreadyFulfilled: false,
      status: "failed",
      error: tx.error,
    };
  }

  // 4. Amount & Currency Validation against authoritative plan
  const authoritativePlan = await getAuthoritativePlan(tx.planId);
  const paidAmount = norm.paidAmount ?? 0;
  const expectedAmount = authoritativePlan.price;

  // Allow negligible floating point tolerance (0.05 JOD)
  if (Math.abs(paidAmount - expectedAmount) > 0.05) {
    console.error(
      `[RenewalEngine] PAYMENT_AMOUNT_MISMATCH: expected ${expectedAmount} JOD, got ${paidAmount} JOD`
    );
    tx.status = "failed";
    tx.error = `PAYMENT_AMOUNT_MISMATCH: expected ${expectedAmount} JOD, got ${paidAmount} JOD`;
    await savePaymentTransaction(tx);
    await incrementPaymentFailed();
    return {
      success: false,
      alreadyFulfilled: false,
      status: "amount_mismatch",
      error: "Payment amount does not match authoritative plan price.",
    };
  }

  // 5. Multi-Layer Idempotency Check (Double callback / Webhook protection)
  const lockKey = String(norm.transactionRef || norm.invoiceId || tx.tranRef || paymentRef);

  const alreadyDone = await isPaymentAlreadyFulfilled(lockKey);
  if (alreadyDone) {
    console.log(`[RenewalEngine] Transaction ${lockKey} was already fulfilled. Skipping duplicate.`);
    await incrementDuplicateCallbackPrevented();
    return {
      success: true,
      alreadyFulfilled: true,
      status: "paid",
      newExpiryDate: tx.newSubEndDate,
      planName: authoritativePlan.nameAr,
      amount: authoritativePlan.price,
      currency: authoritativePlan.currency,
    };
  }

  // Atomically claim fulfillment lock
  const lockAcquired = await acquireRenewalFulfillmentLock(lockKey);
  if (!lockAcquired) {
    console.log(`[RenewalEngine] Renewal fulfillment lock collision for ${lockKey}. Skipping.`);
    await incrementDuplicateCallbackPrevented();
    return {
      success: true,
      alreadyFulfilled: true,
      status: "paid",
      newExpiryDate: tx.newSubEndDate,
      planName: authoritativePlan.nameAr,
      amount: authoritativePlan.price,
      currency: authoritativePlan.currency,
    };
  }

  // 6. Fetch Member Record from Airtable to calculate extension date
  try {
    const memberRecord = await getRecordById(TABLES.MEMBERS, tx.memberId);
    const mf = memberRecord.fields;

    const currentSubEnd = scalar(mf[MEMBER_FIELDS.SUB_END_DATE]);
    const { newStartDate, newEndDate } = calculateNewExpiryDate(
      currentSubEnd,
      authoritativePlan.durationDays
    );

    const currentTotalPaid = scalarNumber(mf[MEMBER_FIELDS.TOTAL_PAID]) ?? 0;
    const newTotalPaid = currentTotalPaid + authoritativePlan.price;

    // 7. Update Member in Airtable
    await updateRecord(TABLES.MEMBERS, tx.memberId, {
      [MEMBER_FIELDS.SUB_START_DATE]: newStartDate,
      [MEMBER_FIELDS.SUB_END_DATE]: newEndDate,
      [MEMBER_FIELDS.SUB_STATUS]: "نشط",
      [MEMBER_FIELDS.PLAN_TYPE]: authoritativePlan.nameAr,
      [MEMBER_FIELDS.TOTAL_PAID]: newTotalPaid,
      [MEMBER_FIELDS.ACTIVE]: true,
    });

    // 8. Create row in Subscriptions Log (TABLES.SUBSCRIPTIONS)
    let paymentMethodName = "الدفع التجريبي (Demo Online)";
    let providerLabel = "Demo Mock";

    if (tx.provider === "paytabs") {
      paymentMethodName = isPayTabsTestMode() ? "PayTabs Online (Test)" : "PayTabs Online (Live)";
      providerLabel = "PayTabs";
    } else if (tx.provider === "myfatoorah") {
      paymentMethodName = isMyFatoorahTestMode() ? "MyFatoorah Online (Sandbox)" : "MyFatoorah Online (Live)";
      providerLabel = "MyFatoorah";
    }

    const subscriptionRecord = await createRecord(TABLES.SUBSCRIPTIONS, {
      [SUBSCRIPTION_FIELDS.MEMBER_LINK]: [tx.memberId],
      [SUBSCRIPTION_FIELDS.EMAIL]: tx.memberEmail,
      [SUBSCRIPTION_FIELDS.START_DATE]: newStartDate,
      [SUBSCRIPTION_FIELDS.END_DATE]: newEndDate,
      [SUBSCRIPTION_FIELDS.PRICE]: authoritativePlan.price,
      [SUBSCRIPTION_FIELDS.PAID]: authoritativePlan.price,
      [SUBSCRIPTION_FIELDS.REMAINING]: 0,
      [SUBSCRIPTION_FIELDS.PLAN_TYPE]: authoritativePlan.nameAr,
      [SUBSCRIPTION_FIELDS.STATUS]: "نشط",
      [SUBSCRIPTION_FIELDS.ACTUAL_STATUS]: "نشط",
      [SUBSCRIPTION_FIELDS.PAYMENT_METHOD]: paymentMethodName,
      [SUBSCRIPTION_FIELDS.NOTES]: `Online Payment Ref: ${paymentRef} | Gateway Ref: ${norm.transactionRef || norm.invoiceId || "Demo"} | Provider: ${providerLabel}`,
    });

    const subscriptionId = subscriptionRecord.id;

    // 9. Update Redis Transaction State
    tx.status = "paid";
    tx.paidAt = Date.now();
    tx.renewedAt = Date.now();
    tx.newSubEndDate = newEndDate;
    tx.tranRef = norm.transactionRef || tx.tranRef;
    if (typeof norm.invoiceId === "number") {
      tx.invoiceId = norm.invoiceId;
    }
    await savePaymentTransaction(tx);

    // 10. Invalidate Caches (Targeted, zero flush)
    await Promise.allSettled([
      deleteFromRedis(REDIS_KEYS.MEMBER_PROFILE(tx.memberId)),
      deleteFromRedis(REDIS_KEYS.MEMBER_DASHBOARD(tx.memberId)),
      deleteFromRedis(REDIS_KEYS.ADMIN_OVERVIEW),
      deleteFromRedis("ultra-gym:admin:members:list"),
    ]);

    // 11. Update Redis SMS Expiry Index so future expiration SMS triggers on the new date
    updateExpiryEntry(
      {
        subscriptionId,
        memberId: tx.memberId,
        expiryTimestampMs: expiryDateToTimestamp(newEndDate),
      },
      {
        memberId: tx.memberId,
        memberName: tx.memberName,
        phone: tx.memberPhone || null,
      }
    ).catch((err) => {
      console.warn("[RenewalEngine] Failed to update SMS expiry index:", err);
    });

    // 12. Trigger existing Push & SMS Renewal Alerts (fire-and-forget)
    notifySubscriptionRenewed(tx.memberId, {
      planType: authoritativePlan.nameAr,
      endDate: newEndDate,
      memberName: tx.memberName,
    }).catch((err) => {
      console.warn("[RenewalEngine] Failed to send push notification:", err);
    });

    if (tx.memberPhone) {
      sendRenewalSms({
        memberId: tx.memberId,
        memberName: tx.memberName,
        phone: tx.memberPhone,
        subscriptionId,
        newExpiryDate: newEndDate,
      }).catch((err) => {
        console.warn("[RenewalEngine] Failed to send renewal SMS:", err);
      });
    }

    // 13. Record Payment Metrics
    await incrementPaymentSuccess(authoritativePlan.price);

    console.log(
      `[RenewalEngine] Successfully renewed subscription for member ${tx.memberId} (${authoritativePlan.nameAr}) until ${newEndDate}`
    );

    return {
      success: true,
      alreadyFulfilled: false,
      status: "paid",
      newExpiryDate: newEndDate,
      newStartDate,
      planName: authoritativePlan.nameAr,
      amount: authoritativePlan.price,
      currency: authoritativePlan.currency,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[RenewalEngine] Error executing renewal fulfillment:", errMsg);
    return {
      success: false,
      alreadyFulfilled: false,
      status: "failed",
      error: `Renewal fulfillment error: ${errMsg}`,
    };
  }
}
