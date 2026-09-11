import { NextResponse } from "next/server";
import { fetchMembershipPlans } from "@/lib/membershipPlans";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/plans
 * Returns authoritative list of membership plans dynamically fetched from Airtable ("الباقات").
 */
export async function GET() {
  try {
    const plans = await fetchMembershipPlans();
    return NextResponse.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("[GET /api/payments/plans] Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch membership packages", error: String(error) },
      { status: 500 }
    );
  }
}
