import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPaymentTransaction } from "@/lib/paymentStore";
import { getAuthoritativePlan } from "@/lib/membershipPlans";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/demo/[transactionId]
 * Returns safe metadata for the internal demo checkout page.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ transactionId: string }> }
) {
  const session = await getSession();
  if (!session || !session.recordId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { transactionId } = await props.params;
  if (!transactionId) {
    return NextResponse.json({ message: "transactionId is required" }, { status: 400 });
  }

  const tx = await getPaymentTransaction(transactionId);
  if (!tx) {
    return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
  }

  if (tx.memberId !== session.recordId && session.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let plan;
  try {
    plan = await getAuthoritativePlan(tx.planId);
  } catch {
    plan = null;
  }

  return NextResponse.json({
    success: true,
    data: {
      transactionId: tx.paymentRef,
      memberName: tx.memberName,
      memberEmail: tx.memberEmail,
      planId: tx.planId,
      planName: plan?.nameAr || tx.planId,
      planNameEn: plan?.nameEn || tx.planId,
      amount: plan?.price || tx.amount,
      currency: tx.currency || "JOD",
      durationDays: plan?.durationDays || 30,
      status: tx.status,
      createdAt: tx.createdAt,
    },
  });
}
