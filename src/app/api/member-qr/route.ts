import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { issueAttendanceQr } from "@/lib/attendanceQrToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signs a short-lived attendance pass for the authenticated member only. */
export async function GET(request: Request) {
  const noStore = { "Cache-Control": "private, no-store, max-age=0" };
  const user = await verifyApiRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  if (user.role !== "member" || !/^rec[A-Za-z0-9]+$/.test(user.recordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  }

  const limit = checkRateLimit(`member-qr:${user.recordId}`, { windowMs: 60_000, maxRequests: 8 });
  if (limit.isLimited) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { ...noStore, "Retry-After": String(limit.resetInSeconds) },
    });
  }

  const secret = process.env.GYM_ACCESS_QR_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "QR service unavailable" }, { status: 503, headers: noStore });
  }

  return NextResponse.json(issueAttendanceQr(user.recordId, secret), { headers: noStore });
}
