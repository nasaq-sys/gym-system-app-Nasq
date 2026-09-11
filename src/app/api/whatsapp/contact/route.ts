import { NextResponse } from "next/server";
import { getGymWhatsAppContact } from "@/lib/whatsappContact";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const contact = await getGymWhatsAppContact();
    return NextResponse.json(
      {
        ok: true,
        data: contact,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve WhatsApp contact";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        data: {
          phone: null,
          displayPhone: null,
          isLinked: false,
          waUrl: null,
        },
      },
      { status: 500 }
    );
  }
}
