import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { markAllNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Called the moment the member opens the notification bell — marks
// everything currently unread as read in one batch.
export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await markAllNotificationsRead(user.recordId);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Mark notifications read error:", error);
    return NextResponse.json(
      { message: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
