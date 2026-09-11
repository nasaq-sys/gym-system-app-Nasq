/**
 * Ultra Gym — Internal Mock Payment Service (Development & Demo Mode)
 *
 * Provides complete payment lifecycle simulation:
 *  - 0 external API calls
 *  - 0 credentials required
 *  - 0 real money processed
 *  - Server-authoritative plan pricing & currency (JOD)
 *  - Multi-layer atomic Redis idempotency
 *  - Exact Airtable subscription updates and renewal Push/SMS triggers
 */

import { getAuthoritativePlan } from "@/lib/membershipPlans";
import {
  savePaymentTransaction,
  getPaymentTransaction,
  type PaymentTransactionRecord,
} from "@/lib/paymentStore";
import { fulfillSubscriptionRenewal, type FulfillRenewalResult } from "@/lib/subscriptionRenewalEngine";
import { incrementPaymentCreated, incrementPaymentFailed } from "@/lib/paymentMetrics";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateMockSessionParams {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string | null;
  planId: string;
}

export interface CreateMockSessionResult {
  success: boolean;
  paymentRef: string;
  paymentUrl: string;
  planName: string;
  amount: number;
  currency: string;
  error?: string;
}

export interface CompleteMockPaymentParams {
  transactionId: string;
  action: "success" | "fail" | "cancel";
  authenticatedMemberId: string;
  isAdmin?: boolean;
}

export interface CompleteMockPaymentResult {
  success: boolean;
  status: "paid" | "failed" | "cancelled" | "amount_mismatch";
  redirectUrl: string;
  newExpiryDate?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  alreadyFulfilled?: boolean;
  error?: string;
}

// ── Service Methods ──────────────────────────────────────────────────────────

/**
 * Creates a pending mock payment transaction and returns the internal demo checkout URL.
 */
export async function createMockPaymentSession(
  params: CreateMockSessionParams
): Promise<CreateMockSessionResult> {
  const { memberId, memberName, memberEmail, memberPhone, planId } = params;

  // 1. Enforce server-authoritative plan price
  const plan = await getAuthoritativePlan(planId);
  const paymentRef = `ug_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const paymentUrl = `/payment/demo/${paymentRef}`;

  // 2. Save pending transaction in Redis (24h TTL)
  const tx: PaymentTransactionRecord = {
    paymentRef,
    memberId,
    memberName: memberName || "عضو Nasaq Gym",
    memberEmail: memberEmail || "member@nasaqjo.com",
    memberPhone: memberPhone || null,
    planId: plan.id,
    amount: plan.price,
    currency: plan.currency, // "JOD"
    status: "pending",
    provider: "mock",
    tranRef: `MOCK_TX_${paymentRef}`,
    cartId: paymentRef,
    paymentUrl,
    createdAt: Date.now(),
  };

  await savePaymentTransaction(tx);

  // 3. Record metric
  await incrementPaymentCreated();

  return {
    success: true,
    paymentRef,
    paymentUrl,
    planName: plan.nameAr,
    amount: plan.price,
    currency: plan.currency,
  };
}

/**
 * Completes a mock payment action (success, fail, cancel) initiated by the user on the demo page.
 */
export async function completeMockPayment(
  params: CompleteMockPaymentParams
): Promise<CompleteMockPaymentResult> {
  const { transactionId, action, authenticatedMemberId, isAdmin } = params;

  // 1. Fetch transaction from Redis
  const tx = await getPaymentTransaction(transactionId);
  if (!tx) {
    return {
      success: false,
      status: "failed",
      redirectUrl: `/payment/result?ref=${transactionId}&status=error`,
      error: `Transaction not found: ${transactionId}`,
    };
  }

  // 2. Cross-Member IDOR Security Guard
  if (tx.memberId !== authenticatedMemberId && !isAdmin) {
    console.warn(
      `[MockPayment] IDOR attack attempt: Member ${authenticatedMemberId} tried to complete transaction belonging to ${tx.memberId}`
    );
    return {
      success: false,
      status: "failed",
      redirectUrl: `/payment/result?ref=${transactionId}&status=error`,
      error: "Forbidden: You cannot complete another member's transaction.",
    };
  }

  // 3. Handle Cancel action
  if (action === "cancel") {
    tx.status = "cancelled";
    await savePaymentTransaction(tx);
    return {
      success: false,
      status: "cancelled",
      redirectUrl: `/payment/result?ref=${transactionId}&status=cancelled`,
      error: "Payment simulation cancelled by user",
    };
  }

  // 4. Handle Fail action
  if (action === "fail") {
    tx.status = "failed";
    tx.error = "Simulated bank payment decline (Test Mode)";
    await savePaymentTransaction(tx);
    await incrementPaymentFailed();
    return {
      success: false,
      status: "failed",
      redirectUrl: `/payment/result?ref=${transactionId}&status=error`,
      error: "Payment simulation failed as requested",
    };
  }

  // 5. Handle Success action -> Execute authoritative subscription renewal
  const authoritativePlan = await getAuthoritativePlan(tx.planId);

  const renewalResult: FulfillRenewalResult = await fulfillSubscriptionRenewal({
    paymentRef: transactionId,
    paymentStatus: {
      isPaid: true,
      isCancelled: false,
      isFailed: false,
      paidAmount: authoritativePlan.price,
      paidCurrency: authoritativePlan.currency,
      transactionRef: tx.tranRef || `MOCK_TX_${transactionId}`,
      userDefined: {
        memberId: tx.memberId,
        planId: tx.planId,
        paymentRef: transactionId,
      },
    },
  });

  return {
    success: renewalResult.success,
    status: renewalResult.status,
    redirectUrl: `/payment/result?ref=${transactionId}`,
    newExpiryDate: renewalResult.newExpiryDate,
    planName: renewalResult.planName || authoritativePlan.nameAr,
    amount: renewalResult.amount || authoritativePlan.price,
    currency: renewalResult.currency || authoritativePlan.currency,
    alreadyFulfilled: renewalResult.alreadyFulfilled,
    error: renewalResult.error,
  };
}
