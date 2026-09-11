import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { isPlanManagedByTrainer, moveScheduleToNextDay } from "@/lib/trainingSchedule";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

// "Vacation" — moves whatever's scheduled for one day into the next day's
// slot (day 7 wraps to day 1). Doesn't touch anchorDay/real weekdays at
// all, just re-labels the plan's target day — a single write per existing
// plan for that day (almost always just one).
export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const day = typeof rawBody?.day === "string" ? rawBody.day.trim() : "";
    if (!day) {
      return NextResponse.json(
        { error: "bad_request", message: "day is required" },
        { status: 400 }
      );
    }

    const result = await moveScheduleToNextDay(user.recordId, day);
    if (!result) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid day" },
        { status: 400 }
      );
    }

    await invalidateWorkoutsCache(user.recordId);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Schedule vacation error:", error);
    return NextResponse.json(
      { message: "Failed to move schedule" },
      { status: 500 }
    );
  }
}
