import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPaymentTransaction, getPaymentTransactionByTranRef } from "@/lib/paymentStore";
import { getAuthoritativePlan } from "@/lib/membershipPlans";
import { queryPayTabsPayment } from "@/lib/paytabsService";
import { getPaymentStatus } from "@/lib/myfatoorahService";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/verify
 *
 * Provider-agnostic payment verification endpoint.
 * Dispatches to mock, paytabs, or myfatoorah verification based on the transaction record.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !session.recordId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      paymentRef?: string;
      tranRef?: string;
      cartId?: string;
      paymentId?: string;
      invoiceId?: string;
    };

    const paymentRef =
      body.paymentRef ||
      body.cartId ||
      searchParams.get("ref") ||
      searchParams.get("cartId") ||
      searchParams.get("paymentRef");

    const tranRef =
      body.tranRef ||
      searchParams.get("tranRef") ||
      searchParams.get("tran_ref");

    const paymentId =
      body.paymentId ||
      searchParams.get("paymentId") ||
      searchParams.get("Id");

    let tx = null;
    if (paymentRef) {
      tx = await getPaymentTransaction(paymentRef);
    }
    if (!tx && tranRef) {
      tx = await getPaymentTransactionByTranRef(tranRef);
    }

    if (!tx && !tranRef && !paymentId) {
      return NextResponse.json({ message: "Payment transaction not found" }, { status: 404 });
    }

    // IDOR Security Check
    if (tx && tx.memberId !== session.recordId && session.role !== "admin") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const provider = tx?.provider || "mock";

    // ── MOCK PROVIDER VERIFICATION ───────────────────────────────────────────
    if (provider === "mock") {
      const plan = tx?.planId ? await getAuthoritativePlan(tx.planId).catch(() => null) : null;
      return NextResponse.json({
        success: tx?.status === "paid",
        data: {
          status: tx?.status || "pending",
          newExpiryDate: tx?.newSubEndDate,
          planName: plan?.nameAr || "اشتراك Nasaq Gym",
          amount: plan?.price || tx?.amount,
          currency: tx?.currency || "JOD",
          error: tx?.error,
        },
      });
    }

    // ── PAYTABS PROVIDER VERIFICATION ────────────────────────────────────────
    if (provider === "paytabs") {
      const resolvedTranRef = tranRef || tx?.tranRef;
      if (!resolvedTranRef) {
        return NextResponse.json({ message: "PayTabs transaction reference missing" }, { status: 400 });
      }

      const paytabsStatus = await queryPayTabsPayment(resolvedTranRef);
      const result = await fulfillSubscriptionRenewal({
        paymentRef: paymentRef || tx?.paymentRef || `cart_${resolvedTranRef}`,
        paytabsStatus,
      });

      return NextResponse.json({
        success: result.success,
        data: {
          status: result.status,
          newExpiryDate: result.newExpiryDate,
          newStartDate: result.newStartDate,
          planName: result.planName,
          amount: result.amount,
          currency: result.currency,
          error: result.error,
        },
      });
    }

    // ── MYFATOORAH PROVIDER VERIFICATION ─────────────────────────────────────
    if (provider === "myfatoorah") {
      const queryKey = paymentId || String(tx?.invoiceId || paymentRef);
      const keyType = paymentId ? "PaymentId" : "CustomerReference";
      const mfStatus = await getPaymentStatus(queryKey, keyType);

      const result = await fulfillSubscriptionRenewal({
        paymentRef: paymentRef || tx?.paymentRef || `pay_${queryKey}`,
        myfatoorahStatus: mfStatus,
      });

      return NextResponse.json({
        success: result.success,
        data: {
          status: result.status,
          newExpiryDate: result.newExpiryDate,
          planName: result.planName,
          amount: result.amount,
          currency: result.currency,
          error: result.error,
        },
      });
    }

    return NextResponse.json({ message: "Invalid payment provider" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/payments/verify] Error:", error);
    return NextResponse.json({ message: "Failed to verify payment status" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
