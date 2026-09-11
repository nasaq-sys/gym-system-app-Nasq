import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, data: user });
}

