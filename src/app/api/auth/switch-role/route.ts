import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createSession, setSessionCookie, type SessionPayload } from "@/lib/auth";

// Only usable when the current session already carries an "alt" identity —
// set at login time when this trainer/staff record is linked to a record in
// the other table (same real person doing both jobs). Swaps active <-> alt
// in a freshly signed JWT; no password re-entry needed since the alt
// identity was already verified during the original login.
export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!user.altRole || !user.altRecordId) {
    return NextResponse.json(
      { message: "No alternate role available for this account" },
      { status: 400 }
    );
  }

  const swapped: SessionPayload = {
    memberId: user.altMemberId || user.altRecordId,
    email: user.email,
    name: user.altName || user.name,
    recordId: user.altRecordId,
    role: user.altRole,
    altRole: user.role,
    altRecordId: user.recordId,
    altMemberId: user.memberId,
    altName: user.name,
  };

  const token = await createSession(swapped);
  await setSessionCookie(token);

  return NextResponse.json({
    success: true,
    data: { role: swapped.role, name: swapped.name },
  });
}

