import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import { TABLES, PRIVATE_SESSION_FIELDS, MEMBER_FIELDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [sessions, members] = await Promise.all([
      getRecords(TABLES.PRIVATE_SESSIONS),
      getRecords(TABLES.MEMBERS),
    ]);

    const memberNameById = new Map(
      members.map((m) => [m.id, scalar(m.fields[MEMBER_FIELDS.NAME])])
    );

    const mySessions = sessions
      .filter((s) => {
        const trainerLinks = s.fields[PRIVATE_SESSION_FIELDS.TRAINER];
        const ids = Array.isArray(trainerLinks) ? (trainerLinks as string[]) : [];
        return ids.includes(user.recordId);
      })
      .map((s) => {
        const memberLinks = s.fields[PRIVATE_SESSION_FIELDS.MEMBER];
        const memberIds = Array.isArray(memberLinks) ? (memberLinks as string[]) : [];
        return {
          id: s.id,
          memberName: memberNameById.get(memberIds[0]) || "",
          date: scalar(s.fields[PRIVATE_SESSION_FIELDS.DATE]),
          startTime: scalar(s.fields[PRIVATE_SESSION_FIELDS.START_TIME]),
          endTime: scalar(s.fields[PRIVATE_SESSION_FIELDS.END_TIME]),
          type: scalar(s.fields[PRIVATE_SESSION_FIELDS.TYPE]),
          packageType: scalar(s.fields[PRIVATE_SESSION_FIELDS.PACKAGE_TYPE]),
          totalPrice: scalar(s.fields[PRIVATE_SESSION_FIELDS.TOTAL_PRICE]),
          paidPrice: scalar(s.fields[PRIVATE_SESSION_FIELDS.PAID_PRICE]),
          remainingPrice: scalar(s.fields[PRIVATE_SESSION_FIELDS.REMAINING_PRICE]),
          paymentStatus: scalar(s.fields[PRIVATE_SESSION_FIELDS.PAYMENT_STATUS]),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ success: true, data: mySessions });
  } catch (error) {
    console.error("Trainer sessions fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
