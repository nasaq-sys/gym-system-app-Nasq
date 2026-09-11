import { NextResponse } from "next/server";
import {
  normalizePayTabsStatus,
  verifyPayTabsSignature,
  queryPayTabsPayment,
} from "@/lib/paytabsService";
import { fulfillSubscriptionRenewal } from "@/lib/subscriptionRenewalEngine";
import { getPaymentTransactionByTranRef, getPaymentTransaction } from "@/lib/paymentStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/paytabs/callback
 *
 * PayTabs Server-to-Server IPN (Instant Payment Notification) Webhook.
 * Guarantees renewal fulfillment even if the user closes their browser
 * during checkout.
 *
 * SECURITY:
 *   - Verifies HMAC-SHA256 signature from PayTabs header.
 *   - Idempotency guard prevents duplicate renewals on replayed webhooks.
 */
export async function POST(request: Request) {
  try {
    const signatureHeader =
      request.headers.get("signature") ||
      request.headers.get("Signature") ||
      request.headers.get("x-paytabs-signature");

    const rawBody = await request.text();

    // 1. Signature Verification (if header present)
    if (signatureHeader) {
      const isValid = verifyPayTabsSignature(rawBody, signatureHeader);
      if (!isValid) {
        console.warn("[PayTabsCallback] Invalid webhook signature. Rejecting.");
        return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
      }
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // URL-encoded form fallback
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries());
    }

    const tranRef = body.tran_ref || body.tranRef;
    const cartId = body.cart_id || body.cartId;

    if (!tranRef && !cartId) {
      return NextResponse.json({ message: "Missing transaction reference" }, { status: 400 });
    }

    // 2. Query PayTabs directly for authoritative status
    let paytabsStatus;
    if (tranRef) {
      paytabsStatus = await queryPayTabsPayment(tranRef);
    } else {
      paytabsStatus = normalizePayTabsStatus(body);
    }

    const resolvedRef = cartId || paytabsStatus.cartId || `cart_${tranRef}`;

    // 3. Execute renewal fulfillment (idempotent)
    const result = await fulfillSubscriptionRenewal({
      paymentRef: resolvedRef,
      paytabsStatus,
    });

    console.log(
      `[PayTabsCallback] IPN processed for ${tranRef || cartId}: status=${result.status}, alreadyDone=${result.alreadyFulfilled}`
    );

    return NextResponse.json({
      success: true,
      message: "Callback processed",
      data: {
        status: result.status,
        alreadyFulfilled: result.alreadyFulfilled,
      },
    });
  } catch (error) {
    console.error("[PayTabsCallback] Error handling callback:", error);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
