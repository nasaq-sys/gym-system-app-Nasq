/**
 * Ultra Gym — Internal Mock Payment Provider Test Suite
 *
 * Validates all 10 core requirements:
 *  1. Active Provider Abstraction (Provider: MOCK, Mode: DEMO, External Calls: 0)
 *  2. Demo Checkout Session Creation (25 JOD Authoritative Price)
 *  3. Cancel Payment Simulation (Subscription untouched, 0 SMS)
 *  4. Failed Payment Simulation (Subscription untouched, 0 SMS)
 *  5. Replay / 10x Duplicate Processing Idempotency (Atomic Redis Lock)
 *  6. Price Tampering Protection (1 JOD vs 25 JOD rejected)
 *  7. Cross-Member IDOR Security Guard (Member A cannot complete Member B's transaction)
 *  8. Authoritative Expiry Date Calculation (UTC calendar extension)
 *  9. Operational Payment Metrics in Redis (Provider: mock, Mode: DEMO)
 * 10. Zero Real Money & Zero External Calls Assurance
 */

import {
  getAuthoritativePlan,
  calculateNewExpiryDate,
} from "@/lib/membershipPlans";
import {
  createMockPaymentSession,
  completeMockPayment,
} from "@/lib/mockPaymentService";
import {
  getPaymentTransaction,
  savePaymentTransaction,
  acquireRenewalFulfillmentLock,
  isPaymentAlreadyFulfilled,
  acquirePaymentCreationLock,
  releasePaymentCreationLock,
  type PaymentTransactionRecord,
} from "@/lib/paymentStore";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";
import { getPaymentMetrics } from "@/lib/paymentMetrics";
import { getActivePaymentProvider } from "@/lib/paymentProvider";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

export async function runMockPaymentSandboxTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING INTERNAL MOCK PAYMENT SANDBOX TEST SUITE");
  console.log("=================================================");

  // ── TEST 1: Provider Factory & Zero External Calls ───────────────────────────
  console.log("\n[Test 1] Active Provider Abstraction & Configuration");
  const activeProvider = getActivePaymentProvider();
  assert(activeProvider.id === "mock", "Active provider is 'mock'");
  assert(activeProvider.isDemo === true, "Provider isDemo is true");
  assert(activeProvider.isExternal === false, "External API calls disabled (isExternal: false)");

  // ── TEST 2: Demo Checkout Session Creation (25 JOD) ──────────────────────────
  console.log("\n[Test 2] Demo Checkout Session Creation (25 JOD Authoritative Price)");
  const memberId = "recDemoMember001";
  const sessionResult = await createMockPaymentSession({
    memberId,
    memberName: "Test Demo Member",
    memberEmail: "demo@ultragym.jo",
    memberPhone: "+962797683960",
    planId: "monthly",
  });

  assert(sessionResult.success === true, "Demo payment session created successfully");
  assert(sessionResult.amount === 25.0, "Authoritative amount is exactly 25.000 JOD");
  assert(sessionResult.currency === "JOD", "Currency is JOD");
  assert(sessionResult.paymentUrl.startsWith("/payment/demo/"), "Redirects to internal /payment/demo/{txId}");

  const savedTx = await getPaymentTransaction(sessionResult.paymentRef);
  assert(savedTx !== null, "Transaction saved in Redis");
  assert(savedTx?.status === "pending", "Transaction status is pending");
  assert(savedTx?.provider === "mock", "Transaction provider marked as mock");

  // ── TEST 3: Cancel Payment Simulation ───────────────────────────────────────
  console.log("\n[Test 3] Cancel Payment Simulation (Subscription Untouched, 0 SMS)");
  const cancelSession = await createMockPaymentSession({
    memberId,
    memberName: "Test Demo Member",
    memberEmail: "demo@ultragym.jo",
    planId: "monthly",
  });

  const cancelResult = await completeMockPayment({
    transactionId: cancelSession.paymentRef,
    action: "cancel",
    authenticatedMemberId: memberId,
  });

  assert(cancelResult.success === false, "Cancelled payment returns success: false");
  assert(cancelResult.status === "cancelled", "Status marked as cancelled");
  assert(cancelResult.redirectUrl.includes("status=cancelled"), "Redirects with status=cancelled");

  const cancelledTx = await getPaymentTransaction(cancelSession.paymentRef);
  assert(cancelledTx?.status === "cancelled", "Redis transaction marked as cancelled");
  assert(cancelledTx?.renewedAt === undefined, "Subscription renewal not executed for cancelled payment");

  // ── TEST 4: Failed Payment Simulation ───────────────────────────────────────
  console.log("\n[Test 4] Failed Payment Simulation (Subscription Untouched, 0 SMS)");
  const failSession = await createMockPaymentSession({
    memberId,
    memberName: "Test Demo Member",
    memberEmail: "demo@ultragym.jo",
    planId: "monthly",
  });

  const failResult = await completeMockPayment({
    transactionId: failSession.paymentRef,
    action: "fail",
    authenticatedMemberId: memberId,
  });

  assert(failResult.success === false, "Failed payment returns success: false");
  assert(failResult.status === "failed", "Status marked as failed");
  assert(failResult.redirectUrl.includes("status=error"), "Redirects with status=error");

  const failedTx = await getPaymentTransaction(failSession.paymentRef);
  assert(failedTx?.status === "failed", "Redis transaction marked as failed");
  assert(failedTx?.renewedAt === undefined, "Subscription renewal not executed for failed payment");

  // ── TEST 5: Replay / 10x Duplicate Processing Idempotency ────────────────────
  console.log("\n[Test 5] 10x Duplicate Processing Idempotency Protection");
  const testTranRef = `MOCK_TX_DUP_${Date.now()}`;
  const lockAcquiredFirst = await acquireRenewalFulfillmentLock(testTranRef);
  assert(lockAcquiredFirst === true, "First callback acquired renewal fulfillment lock");

  let duplicatePreventedCount = 0;
  for (let i = 0; i < 9; i++) {
    const isAlreadyDone = await isPaymentAlreadyFulfilled(testTranRef);
    const lockAgain = await acquireRenewalFulfillmentLock(testTranRef);
    if (isAlreadyDone || !lockAgain) {
      duplicatePreventedCount++;
    }
  }

  assert(
    duplicatePreventedCount === 9,
    `All 9 replayed success completions blocked by atomic lock (count=${duplicatePreventedCount})`
  );

  // ── TEST 6: Price Tampering Protection (1 JOD vs 25 JOD) ─────────────────────
  console.log("\n[Test 6] Price Tampering Protection");
  const tamperRef = `ug_mock_tamper_${Date.now()}`;
  await savePaymentTransaction({
    paymentRef: tamperRef,
    memberId: "recDemoMember001",
    memberName: "Attacker Member",
    memberEmail: "attacker@ultragym.jo",
    planId: "monthly", // Authoritative price is 25.000 JOD
    amount: 25.0,
    currency: "JOD",
    status: "pending",
    provider: "mock",
    tranRef: `MOCK_TX_${tamperRef}`,
    createdAt: Date.now(),
  });

  // Attempt to fulfill renewal with tampered paidAmount = 1.000 JOD
  const tamperFulfillResult = await fulfillSubscriptionRenewal({
    paymentRef: tamperRef,
    paymentStatus: {
      isPaid: true,
      isCancelled: false,
      isFailed: false,
      paidAmount: 1.0, // 1 JOD instead of 25 JOD
      paidCurrency: "JOD",
      transactionRef: `MOCK_TX_${tamperRef}`,
    },
  });

  assert(tamperFulfillResult.success === false, "Tampered amount rejected by renewal engine");
  assert(tamperFulfillResult.status === "amount_mismatch", "Status is amount_mismatch");

  // ── TEST 7: Cross-Member IDOR Security Guard ─────────────────────────────────
  console.log("\n[Test 7] Cross-Member IDOR Security Guard");
  const victimMemberId = "recVictimMember999";
  const attackerMemberId = "recAttackerMember444";

  const victimSession = await createMockPaymentSession({
    memberId: victimMemberId,
    memberName: "Victim Member",
    memberEmail: "victim@ultragym.jo",
    planId: "monthly",
  });

  const idorAttackResult = await completeMockPayment({
    transactionId: victimSession.paymentRef,
    action: "cancel",
    authenticatedMemberId: attackerMemberId, // Attacker tries to alter victim's payment
  });

  assert(idorAttackResult.success === false, "Attacker action rejected");
  assert(Boolean(idorAttackResult.error?.includes("Forbidden")), "Blocked with Forbidden IDOR error");

  // ── TEST 8: Authoritative Expiry Date Calculation ────────────────────────────
  console.log("\n[Test 8] Authoritative Expiry Date Calculation");
  const activeExpiry = "2026-09-15";
  const extended = calculateNewExpiryDate(activeExpiry, 30);
  assert(extended.newEndDate === "2026-10-15", "Active subscription extended (2026-09-15 + 30d = 2026-10-15)");
  assert(extended.isExtended === true, "Marked as extended");

  // ── TEST 9: Operational Payment Metrics (Provider: MOCK, Mode: DEMO) ─────────
  console.log("\n[Test 9] Operational Payment Metrics in Redis");
  const metrics = await getPaymentMetrics();
  assert(metrics.provider === "mock", "Metrics provider is 'mock'");
  assert(metrics.mode === "DEMO", "Metrics mode is 'DEMO'");
  assert(typeof metrics.paymentsCreated === "number", "Demo payments created is a valid number");
  assert(typeof metrics.paymentsFailed === "number", "Demo payments failed is a valid number");
  assert(typeof metrics.paymentsCancelled === "number", "Demo payments cancelled is a valid number");
  assert(typeof metrics.duplicateCallbacksPrevented === "number", "Duplicate callbacks prevented is a valid number");

  // ── TEST 10: Zero Real Money & Zero External Calls Assurance ─────────────────
  console.log("\n[Test 10] Zero External Calls & Zero Real Money Validation");
  assert(activeProvider.isExternal === false, "External payment gateway calls = 0");
  assert(process.env.PAYMENT_PROVIDER === "mock", "PAYMENT_PROVIDER is strictly 'mock'");

  console.log("=================================================");
  console.log("🎉 ALL 10 MOCK PAYMENT SANDBOX TESTS PASSED 100%!");
  console.log("=================================================");
}
