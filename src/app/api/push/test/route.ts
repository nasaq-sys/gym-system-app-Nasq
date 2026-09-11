import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { sendPushToUser, getUserSubscriptions } from "@/lib/webPush";

export const dynamic = "force-dynamic";

// Sends a real server-side push notification fanning out to ALL of the current user's
// registered devices (iPhone, Android, Desktop, etc.). Returns per-device delivery diagnostics.
export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const customTitle = typeof rawBody?.title === "string" ? rawBody.title.trim() : "";
    const customBody = typeof rawBody?.body === "string" ? rawBody.body.trim() : "";
    const customUrl = typeof rawBody?.url === "string" ? rawBody.url.trim() : "";

    const subs = await getUserSubscriptions(user.recordId, user.role);
    if (subs.length === 0) {
      return NextResponse.json(
        {
          error: "no_subscriptions",
          message: "No push subscriptions registered for this user/device on the backend",
          userId: user.recordId,
        },
        { status: 404 }
      );
    }

    const payload = {
      title: customTitle || "Nasaq Gym",
      body: customBody || "تم استلام الإشعار بنجاح! — Test notification received successfully!",
      url: customUrl || "/notifications",
      tag: `test-push-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    const pushResult = await sendPushToUser(user.recordId, payload, user.role);

    return NextResponse.json({
      success: pushResult.sent > 0,
      userId: user.recordId,
      subscriptionsFound: pushResult.subscriptionsFound,
      attempted: pushResult.attempted,
      sent: pushResult.sent,
      failed: pushResult.failed,
      dead: pushResult.dead,
      devices: pushResult.devices,
      details: pushResult.details,
    });
  } catch (error) {
    console.error("[api/push/test] Error:", error);
    return NextResponse.json(
      { message: "Failed to send test notification", error: String(error) },
      { status: 500 }
    );
  }
}
