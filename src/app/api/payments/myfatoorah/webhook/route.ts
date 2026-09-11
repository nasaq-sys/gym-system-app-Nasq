import { NextResponse } from "next/server";
import { getPaymentStatus } from "@/lib/myfatoorahService";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";
import { getPaymentTransactionByInvoiceId } from "@/lib/paymentStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/myfatoorah/webhook
 *
 * Webhook listener for MyFatoorah payment notifications.
 * Ensures the subscription is renewed even if the user closes their browser
 * before the redirect callback completes.
 *
 * Idempotency guarantees:
 *   If callback ALREADY fulfilled the renewal, webhook safely skips it.
 *   If webhook fulfills it first, callback safely displays the already-fulfilled result.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    // MyFatoorah sends either { Event: "...", Data: { InvoiceId, PaymentId, ... } }
    // or direct transaction fields
    const invoiceId =
      body?.Data?.InvoiceId ||
      body?.InvoiceId ||
      body?.Data?.PaymentId ||
      body?.PaymentId;

    const paymentRef =
      body?.Data?.CustomerReference ||
      body?.CustomerReference;

    if (!invoiceId && !paymentRef) {
      return NextResponse.json({ message: "Missing InvoiceId / Reference" }, { status: 400 });
    }

    // 1. Resolve local transaction
    let resolvedRef = paymentRef;
    if (!resolvedRef && invoiceId) {
      const tx = await getPaymentTransactionByInvoiceId(invoiceId);
      resolvedRef = tx?.paymentRef;
    }

    // 2. Query MyFatoorah server-to-server to verify authenticity
    const queryKey = String(invoiceId || resolvedRef);
    const keyType = invoiceId ? "InvoiceId" : "CustomerReference";
    const myfatoorahStatus = await getPaymentStatus(queryKey, keyType);

    if (!myfatoorahStatus.success) {
      console.warn(`[MyFatoorahWebhook] Failed to verify payment for ${queryKey}:`, myfatoorahStatus.error);
      return NextResponse.json({ message: "Verification failed" }, { status: 200 }); // Return 200 so gateway doesn't spam retries
    }

    // 3. Execute renewal fulfillment (idempotent)
    const finalRef = resolvedRef || myfatoorahStatus.customerReference || `invoice_${invoiceId}`;
    const result = await fulfillSubscriptionRenewal({
      paymentRef: finalRef,
      myfatoorahStatus,
    });

    console.log(
      `[MyFatoorahWebhook] Webhook processed for invoice ${invoiceId}: status=${result.status}, alreadyDone=${result.alreadyFulfilled}`
    );

    return NextResponse.json({
      success: true,
      message: "Webhook processed",
      data: {
        status: result.status,
        alreadyFulfilled: result.alreadyFulfilled,
      },
    });
  } catch (error) {
    console.error("[MyFatoorahWebhook] Error handling webhook:", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
