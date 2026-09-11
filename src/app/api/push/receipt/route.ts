import { NextResponse } from "next/server";
import { recordDeliveryReceipt, type TelemetryStage } from "@/lib/webPush";
import { verifyReceiptToken } from "@/lib/pushReceiptCrypto";

export const dynamic = "force-dynamic";

const VALID_STAGES = new Set<string>(["received", "display_requested", "clicked"]);

// Hardened telemetry endpoint called by public/sw.js for background and foreground delivery tracking.
// Protected by delivery-bound HMAC-SHA256 receipt tokens without requiring session cookies.
export async function POST(request: Request) {
  // 1. Validate content type
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "bad_request", message: "Content-Type must be application/json" },
      { status: 400 }
    );
  }

  // 2. Parse and validate payload structure
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    // Enforce reasonable max payload size (16KB)
    if (text.length > 16384) {
      return NextResponse.json(
        { error: "bad_request", message: "Payload too large" },
        { status: 413 }
      );
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON format" },
      { status: 400 }
    );
  }

  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId.trim() : "";
  const receiptToken = typeof body.receiptToken === "string" ? body.receiptToken.trim() : "";
  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : undefined;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : undefined;

  // 3. Validate stage parameter
  if (!stage || !VALID_STAGES.has(stage)) {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid or unsupported telemetry stage" },
      { status: 400 }
    );
  }

  if (!deliveryId) {
    return NextResponse.json(
      { error: "bad_request", message: "deliveryId is required" },
      { status: 400 }
    );
  }

  // 4. Cryptographically verify receipt authorization token
  const verification = verifyReceiptToken(receiptToken, deliveryId, notificationId);

  if (!verification.valid || !verification.payload) {
    // Safe generic audit log without logging the full raw token
    console.warn(
      `[PushReceipt] ⛔ Unauthorized receipt attempt for deliveryId="${deliveryId}" stage="${stage}": ${verification.reason || "Invalid token"}`
    );
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid receipt authorization" },
      { status: 401 }
    );
  }

  // 5. Update delivery analytics idempotently
  const tokenPayload = verification.payload;
  const targetNotificationId = notificationId || tokenPayload.nid;
  const targetDeviceId = deviceId || tokenPayload.dev;

  try {
    const recordResult = await recordDeliveryReceipt(
      targetNotificationId,
      deliveryId,
      stage as TelemetryStage,
      targetDeviceId
    );

    if (!recordResult.success) {
      console.warn(
        `[PushReceipt] Telemetry record skipped for deliveryId="${deliveryId}": ${recordResult.reason}`
      );
    } else {
      console.log(
        `[PushReceipt] ✓ Verified receipt recorded for deliveryId="${deliveryId}" stage="${stage}"`
      );
    }

    return NextResponse.json({
      success: true,
      stage,
      deliveryId,
    });
  } catch (err) {
    console.error("[PushReceipt Error]", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to process receipt" },
      { status: 500 }
    );
  }
}
