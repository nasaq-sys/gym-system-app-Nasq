import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getLiveGymCount } from "@/lib/liveCount";
import { triggerDailySubscriptionScanIfNeeded } from "@/lib/subscriptionNotifications";

// Cache route revalidation for 60 seconds
export const revalidate = 60;

export async function GET(request: Request) {
  // Trigger daily automated subscription expiration scan once per day
  triggerDailySubscriptionScanIfNeeded().catch(() => {});
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await getLiveGymCount();

    return NextResponse.json(
      {
        success: true,
        data: { count },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Gym count fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch gym count" },
      { status: 500 }
    );
  }
}

