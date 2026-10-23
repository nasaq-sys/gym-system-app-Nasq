import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { resetMemberDevice } from "@/lib/memberDevice";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** An administrator can release a lost or replaced phone after identity checks. */
export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (checkRateLimit(`device-reset:${user.recordId}`, { windowMs: 60_000, maxRequests: 5 }).isLimited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const recordId = typeof body?.recordId === "string" ? body.recordId : "";
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) {
    return NextResponse.json({ error: "Invalid member ID" }, { status: 400 });
  }
  try {
    if (!(await resetMemberDevice(recordId))) {
      return NextResponse.json({ error: "Device storage unavailable" }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Device reset failed" }, { status: 503 });
  }
}
