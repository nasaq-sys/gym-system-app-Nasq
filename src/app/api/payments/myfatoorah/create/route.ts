import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuthoritativePlan } from "@/lib/membershipPlans";
import { createPaymentInvoice } from "@/lib/myfatoorahService";
import {
  savePaymentTransaction,
  acquirePaymentCreationLock,
  releasePaymentCreationLock,
} from "@/lib/paymentStore";
import { incrementPaymentCreated } from "@/lib/paymentMetrics";
import { getFromRedis } from "@/lib/redisClient";
import { REDIS_KEYS } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

function getBaseAppUrl(request: Request): string {
  const envUrl = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // Derive from request origin
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${protocol}://${host}`;

  return "https://ultra-gym.netlify.app";
}

/**
 * POST /api/payments/myfatoorah/create
 *
 * Creates a MyFatoorah hosted payment session for the authenticated member.
 *
 * Body:
 *   planId string — plan identifier (e.g. "monthly", "quarterly", "semi_annual", "annual")
 *
 * SECURITY:
 *   - Authenticated member only (`getSession()`).
 *   - Server loads authoritative plan price (ignores any price/amount in body).
 *   - Anti-double-click lock prevents duplicate invoice creations.
 */
export async function POST(request: Request) {
  // 1. Zero-Trust Authentication
  const session = await getSession();
  if (!session || !session.recordId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      planId?: string;
      // Client might send price/memberId — strictly IGNORED
    };

    const planId = body.planId;
    if (!planId) {
      return NextResponse.json({ message: "planId is required" }, { status: 400 });
    }

    // 2. Validate authoritative plan
    let plan;
    try {
      plan = await getAuthoritativePlan(planId);
    } catch {
      return NextResponse.json(
        { message: `Invalid membership plan: "${planId}"` },
        { status: 400 }
      );
    }

    const memberId = session.recordId;
    const memberName = session.name || "عضو Nasaq Gym";
    const memberEmail = session.email;

    // 3. Double-Click Idempotency Lock
    const lockAcquired = await acquirePaymentCreationLock(memberId, plan.id);
    if (!lockAcquired) {
      return NextResponse.json(
        { message: "A payment session is already being created. Please wait." },
        { status: 429 }
      );
    }

    // 4. Resolve member phone from Redis cache (0 Airtable reads)
    let memberPhone: string | null = null;
    try {
      const cacheKey = REDIS_KEYS.MEMBER_PROFILE(memberId);
      const cached = await getFromRedis<{ payload?: { phone?: string }; phone?: string }>(cacheKey);
      if (cached) {
        const profile = cached.payload ?? cached;
        memberPhone = profile.phone || null;
      }
    } catch {
      // Non-critical
    }

    // 5. Build payment reference and URLs
    const appUrl = getBaseAppUrl(request);
    const paymentRef = `ug_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const callBackUrl = `${appUrl}/payment/result?ref=${paymentRef}`;
    const errorUrl = `${appUrl}/payment/result?ref=${paymentRef}&status=error`;

    // 6. Call MyFatoorah SendPayment
    const invoiceResult = await createPaymentInvoice({
      memberId,
      memberName,
      memberEmail,
      memberPhone,
      planId: plan.id,
      paymentRef,
      callBackUrl,
      errorUrl,
    });

    if (!invoiceResult.success || !invoiceResult.paymentUrl) {
      await releasePaymentCreationLock(memberId, plan.id);
      return NextResponse.json(
        {
          message: invoiceResult.error || "Failed to create payment session with gateway",
        },
        { status: 502 }
      );
    }

    // 7. Store temporary transaction in Redis (24 hours TTL)
    await savePaymentTransaction({
      paymentRef,
      memberId,
      memberName,
      memberEmail,
      memberPhone,
      planId: plan.id,
      amount: plan.price,
      currency: plan.currency,
      status: "pending",
      invoiceId: invoiceResult.invoiceId,
      paymentUrl: invoiceResult.paymentUrl,
      createdAt: Date.now(),
    });

    // 8. Record metric
    await incrementPaymentCreated();

    return NextResponse.json({
      success: true,
      data: {
        paymentRef,
        paymentUrl: invoiceResult.paymentUrl,
        invoiceId: invoiceResult.invoiceId,
        plan: {
          id: plan.id,
          name: plan.nameAr,
          price: plan.price,
          currency: plan.currency,
        },
      },
    });
  } catch (error) {
    console.error("[POST /api/payments/myfatoorah/create] Error:", error);
    return NextResponse.json(
      { message: "Internal server error creating payment" },
      { status: 500 }
    );
  }
}
