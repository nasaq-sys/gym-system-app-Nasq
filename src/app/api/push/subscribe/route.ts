import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { saveUserSubscription, removeUserSubscription, DevicePlatform } from "@/lib/webPush";

export const dynamic = "force-dynamic";

function isValidSubscription(
  body: unknown
): body is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceId?: string;
  platform?: DevicePlatform;
  browser?: string;
  deviceLabel?: string;
  userAgent?: string;
  isStandalone?: boolean;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.endpoint !== "string" || !b.endpoint) return false;
  const keys = b.keys as Record<string, unknown> | undefined;
  return !!keys && typeof keys.p256dh === "string" && typeof keys.auth === "string";
}

export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!isValidSubscription(rawBody)) {
    return NextResponse.json({ message: "Invalid subscription" }, { status: 400 });
  }

  try {
    await saveUserSubscription(
      user.recordId,
      {
        endpoint: rawBody.endpoint,
        keys: rawBody.keys,
        deviceId: rawBody.deviceId,
        platform: rawBody.platform,
        browser: rawBody.browser,
        deviceLabel: rawBody.deviceLabel,
        userAgent: rawBody.userAgent || request.headers.get("user-agent") || undefined,
      },
      user.role
    );
    return NextResponse.json({ success: true, userId: user.recordId });
  } catch (error) {
    console.error("[api/push/subscribe] Error:", error);
    return NextResponse.json(
      { message: "Failed to save subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const endpoint =
    rawBody && typeof rawBody === "object"
      ? (rawBody as Record<string, unknown>).endpoint
      : null;
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ message: "Missing endpoint" }, { status: 400 });
  }

  try {
    await removeUserSubscription(user.recordId, endpoint, user.role);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/push/subscribe] DELETE error:", error);
    return NextResponse.json(
      { message: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}
