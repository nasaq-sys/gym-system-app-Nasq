import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { completeMockPayment } from "@/lib/mockPaymentService";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/demo/complete
 *
 * Server-side completion endpoint for simulated payments on the demo checkout page.
 *
 * Body:
 *   transactionId string — payment reference (e.g. "ug_mock_...")
 *   action "success" | "fail" | "cancel"
 *
 * SECURITY:
 *   - Authenticated session strictly required.
 *   - IDOR protection: verified against memberId stored in Redis.
 *   - Exactly-Once Renewal: atomic Redis fulfillment lock.
 */
export async function POST(request: Request) {
  // 1. Zero-Trust Authentication
  const session = await getSession();
  if (!session || !session.recordId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      transactionId?: string;
      action?: "success" | "fail" | "cancel";
    };

    const transactionId = body.transactionId;
    const action = body.action || "success";

    if (!transactionId) {
      return NextResponse.json({ message: "transactionId is required" }, { status: 400 });
    }

    if (action !== "success" && action !== "fail" && action !== "cancel") {
      return NextResponse.json(
        { message: "Invalid action. Must be 'success', 'fail', or 'cancel'" },
        { status: 400 }
      );
    }

    // 2. Execute Demo Payment Simulation
    const result = await completeMockPayment({
      transactionId,
      action,
      authenticatedMemberId: session.recordId,
      isAdmin: session.role === "admin",
    });

    return NextResponse.json({
      success: result.success,
      data: {
        status: result.status,
        redirectUrl: result.redirectUrl,
        newExpiryDate: result.newExpiryDate,
        planName: result.planName,
        amount: result.amount,
        currency: result.currency,
        alreadyFulfilled: result.alreadyFulfilled,
        error: result.error,
      },
    });
  } catch (error) {
    console.error("[POST /api/payments/demo/complete] Error:", error);
    const errMsg = error instanceof Error ? error.message : "Internal error completing demo payment";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}
