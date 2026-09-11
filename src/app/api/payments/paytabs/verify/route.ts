import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryPayTabsPayment, normalizePayTabsStatus } from "@/lib/paytabsService";
import {
  getPaymentTransaction,
  getPaymentTransactionByTranRef,
} from "@/lib/paymentStore";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/paytabs/verify
 *
 * Verifies PayTabs payment status server-to-server and fulfills the subscription renewal.
 *
 * Body or query params:
 *   tranRef string? — PayTabs transaction reference (e.g. TST2109800000000)
 *   paymentRef string? — Ultra Gym paymentRef / cart_id (e.g. ug_cart_...)
 *
 * SECURITY:
 *   - Authenticated session strictly required.
 *   - Cross-member IDOR guard prevents accessing other members' transactions.
 *   - Queries PayTabs directly (never trusts browser redirect parameters).
 */
export async function POST(request: Request) {
  // 1. Zero-Trust Authentication
  const session = await getSession();
  if (!session || !session.recordId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      tranRef?: string;
      paymentRef?: string;
      cartId?: string;
    };

    const tranRef =
      body.tranRef ||
      searchParams.get("tranRef") ||
      searchParams.get("tran_ref");

    const paymentRef =
      body.paymentRef ||
      body.cartId ||
      searchParams.get("ref") ||
      searchParams.get("cartId") ||
      searchParams.get("cart_id");

    if (!tranRef && !paymentRef) {
      return NextResponse.json(
        { message: "tranRef or paymentRef is required" },
        { status: 400 }
      );
    }

    // 2. Locate transaction in Redis
    let tx = null;
    if (paymentRef) {
      tx = await getPaymentTransaction(paymentRef);
    }
    if (!tx && tranRef) {
      tx = await getPaymentTransactionByTranRef(tranRef);
    }

    const resolvedTranRef = tranRef || tx?.tranRef;
    const resolvedRef = paymentRef || tx?.paymentRef || `cart_${resolvedTranRef}`;

    // 3. Cross-Member IDOR Security Guard
    if (tx && tx.memberId !== session.recordId && session.role !== "admin") {
      console.warn(
        `[PayTabsVerify] IDOR attack attempt: Member ${session.recordId} tried to verify payment belonging to ${tx.memberId}`
      );
      return NextResponse.json(
        { message: "Forbidden: You cannot access other members' payment records." },
        { status: 403 }
      );
    }

    // 4. Query PayTabs server-to-server
    if (!resolvedTranRef) {
      return NextResponse.json(
        { message: "Could not find PayTabs transaction reference" },
        { status: 400 }
      );
    }

    const paytabsStatus = await queryPayTabsPayment(resolvedTranRef);

    // 5. Execute Renewal Fulfillment (idempotent, thread-safe)
    const result = await fulfillSubscriptionRenewal({
      paymentRef: resolvedRef,
      paytabsStatus,
    });

    return NextResponse.json({
      success: result.success,
      data: {
        status: result.status,
        alreadyFulfilled: result.alreadyFulfilled,
        newExpiryDate: result.newExpiryDate,
        newStartDate: result.newStartDate,
        planName: result.planName,
        amount: result.amount,
        currency: result.currency,
        tranRef: resolvedTranRef,
        error: result.error,
      },
    });
  } catch (error) {
    console.error("[POST /api/payments/paytabs/verify] Error:", error);
    return NextResponse.json(
      { message: "Failed to verify PayTabs payment" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
