import { NextResponse } from "next/server";
import { scanAndNotifyExpiringSubscriptions } from "@/lib/subscriptionNotifications";

export const dynamic = "force-dynamic";

// GET /api/cron/check-subscriptions
// Scheduled Daily Cron Job for Subscription Expiration Alerts.
// Can be called via Vercel Cron, GitHub Actions, or any HTTP scheduler.
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const cronSecret = process.env.CRON_SECRET;
    const queryKey = searchParams.get("key");

    // If CRON_SECRET is defined, verify it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && queryKey !== cronSecret) {
      return NextResponse.json({ message: "Unauthorized cron execution" }, { status: 401 });
    }

    const thresholdDays = Number(searchParams.get("days")) || 5;
    const result = await scanAndNotifyExpiringSubscriptions(thresholdDays);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: result,
    });
  } catch (error) {
    console.error("[CronCheckSubscriptions] Error:", error);
    return NextResponse.json(
      { message: "Cron check failed", error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
