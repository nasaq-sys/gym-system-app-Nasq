import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import {
  getUserSubscriptions,
  getEndpointHostname,
  getEndpointFingerprint,
  inferPlatformAndProvider,
} from "@/lib/webPush";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ authenticated: false, activeCount: 0 }, { status: 401 });
  }

  try {
    const subs = await getUserSubscriptions(user.recordId, user.role);

    const devices = subs.map((s) => {
      const hostname = getEndpointHostname(s.endpoint);
      const fingerprint = getEndpointFingerprint(s.endpoint);
      const { platform, provider } = inferPlatformAndProvider(
        s.endpoint,
        s.userAgent,
        s.platform
      );

      return {
        platform: s.platform || platform,
        provider,
        browser: s.browser || "Browser",
        deviceLabel: s.deviceLabel || `${s.platform || platform} (${provider})`,
        endpointHostname: hostname,
        endpointFingerprint: fingerprint,
        active: s.active !== false,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        lastSuccessfulPush: s.lastProviderAcceptedAt || s.lastDeviceReceiptAt,
        lastFailure: s.lastFailureReason || s.lastFailureAt,
        lastFailureStatus: s.lastFailureStatus,
      };
    });

    return NextResponse.json({
      authenticated: true,
      userId: user.recordId,
      role: user.role,
      activeCount: subs.length,
      endpoints: devices.map((d) => d.endpointHostname),
      devices,
      hasSubscriptions: subs.length > 0,
    });
  } catch (error) {
    console.error("[api/push/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch push status", activeCount: 0, devices: [] },
      { status: 500 }
    );
  }
}
