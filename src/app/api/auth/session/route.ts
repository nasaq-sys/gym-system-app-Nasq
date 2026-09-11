import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { destroySession } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, data: user });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ success: true });
}

