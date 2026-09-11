import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPaymentStatus } from "@/lib/myfatoorahService";
import { getPaymentTransaction, getPaymentTransactionByInvoiceId } from "@/lib/paymentStore";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/myfatoorah/verify
 *
 * Verifies the actual payment status with MyFatoorah and fulfills the renewal.
 *
 * Body or query params:
 *   paymentId string? — MyFatoorah PaymentId returned in URL
 *   invoiceId string? — MyFatoorah InvoiceId returned in URL
 *   paymentRef string? — Ultra Gym paymentRef (CustomerReference)
 *
 * SECURITY:
 *   - Authenticates session.
 *   - Verifies that the payment transaction belongs to the calling member (IDOR guard).
 *   - Strictly validates status from MyFatoorah server-to-server (never trusts query params).
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
      paymentId?: string;
      invoiceId?: string | number;
      paymentRef?: string;
    };

    const paymentId = body.paymentId || searchParams.get("paymentId") || searchParams.get("Id");
    const invoiceId = body.invoiceId || searchParams.get("invoiceId");
    const paymentRef = body.paymentRef || searchParams.get("ref");

    if (!paymentId && !invoiceId && !paymentRef) {
      return NextResponse.json(
        { message: "paymentId, invoiceId, or paymentRef is required" },
        { status: 400 }
      );
    }

    // 2. Locate the transaction in Redis
    let tx = null;
    if (paymentRef) {
      tx = await getPaymentTransaction(paymentRef);
    }
    if (!tx && invoiceId) {
      tx = await getPaymentTransactionByInvoiceId(invoiceId);
    }

    // 3. Query MyFatoorah for server-to-server status
    let queryKey = paymentId || String(invoiceId || tx?.invoiceId || paymentRef);
    let keyType: "PaymentId" | "InvoiceId" | "CustomerReference" = paymentId
      ? "PaymentId"
      : invoiceId
        ? "InvoiceId"
        : "CustomerReference";

    const myfatoorahStatus = await getPaymentStatus(queryKey, keyType);

    // If query failed with PaymentId, fallback to InvoiceId or CustomerReference
    if (!myfatoorahStatus.success && tx?.paymentRef) {
      const fallbackStatus = await getPaymentStatus(tx.paymentRef, "CustomerReference");
      if (fallbackStatus.success) {
        Object.assign(myfatoorahStatus, fallbackStatus);
      }
    }

    // Resolve paymentRef from status if not known
    const resolvedRef =
      paymentRef ||
      myfatoorahStatus.customerReference ||
      tx?.paymentRef ||
      (invoiceId ? `invoice_${invoiceId}` : "");

    // 4. Cross-Member IDOR Security Guard
    if (tx && tx.memberId !== session.recordId && session.role !== "admin") {
      console.warn(
        `[PaymentVerify] IDOR attack attempt: Member ${session.recordId} tried to verify payment belonging to ${tx.memberId}`
      );
      return NextResponse.json(
        { message: "Forbidden: You cannot access other members' payment records." },
        { status: 403 }
      );
    }

    // 5. Execute Renewal Fulfillment (idempotent, thread-safe)
    const result = await fulfillSubscriptionRenewal({
      paymentRef: resolvedRef,
      myfatoorahStatus,
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
        invoiceId: myfatoorahStatus.invoiceId,
        error: result.error,
      },
    });
  } catch (error) {
    console.error("[POST /api/payments/myfatoorah/verify] Error:", error);
    return NextResponse.json(
      { message: "Failed to verify payment status" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
