import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyAttendanceQr } from "@/lib/attendanceQrToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the receipt from the same access server that records attendance. */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const user = await verifyApiRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (user.role !== "member" || !/^rec[A-Za-z0-9]+$/.test(user.recordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }
  if (checkRateLimit(`member-qr-status:${user.recordId}`, { windowMs: 60_000, maxRequests: 60 }).isLimited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
  }
  const secret = process.env.GYM_ACCESS_QR_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "QR service unavailable" }, { status: 503, headers });
  let tokens: unknown;
  try { tokens = (await request.json()).tokens; }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 3 ||
      tokens.some((token) => typeof token !== "string" || verifyAttendanceQr(token, secret, Date.now(), 60)?.id !== user.recordId)) {
    return NextResponse.json({ error: "Invalid QR passes" }, { status: 400, headers });
  }
  try {
    const origin = process.env.GYM_MANAGER_ACCESS_URL || "https://ultragym.nasaqjo.com";
    const response = await fetch(new URL("/api/access?action=qr-status", origin), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Reception status unavailable");
    const result = await response.json();
    return NextResponse.json({ checkedIn: result.checkedIn === true, at: result.checkedIn ? result.at : null }, { headers });
  } catch {
    return NextResponse.json({ error: "Check-in status unavailable" }, { status: 503, headers });
  }
}
