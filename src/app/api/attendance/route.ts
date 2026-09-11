import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRecordsByFilter } from "@/lib/airtable";
import { TABLES, ATTENDANCE_SESSION_FIELDS, ATTENDANCE_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

function isDenied(decision: unknown): boolean {
  if (!decision) return false;
  const str = String(decision);
  return str.includes("❌") || str.includes("مرفوض") || str.includes("غير مسموح");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month"); // "YYYY-MM" or "M"
  const yearParam = searchParams.get("year"); // "YYYY"

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12

  if (yearParam && !isNaN(Number(yearParam))) {
    year = Number(yearParam);
  }

  if (monthParam) {
    if (monthParam.includes("-")) {
      const parts = monthParam.split("-");
      year = Number(parts[0]) || year;
      month = Number(parts[1]) || month;
    } else if (!isNaN(Number(monthParam))) {
      month = Number(monthParam);
    }
  }

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const cacheKey = REDIS_KEYS.ATTENDANCE_MONTH(monthStart);

  try {
    const cacheResult = await withCacheSWR<{
      sessions: { memberIds: string[]; inStr?: string; outStr?: string }[];
      rawLogs: { memberIds: string[]; dateStr?: string; decision?: string }[];
    }>(
      cacheKey,
      async () => {
        const [sessionRecords, rawRecords] = await Promise.all([
          // 1. Fetch from جلسات الحضور
          getRecordsByFilter(
            TABLES.ATTENDANCE_SESSIONS,
            `OR(IS_SAME({${ATTENDANCE_SESSION_FIELDS.DATE}}, '${monthStart}', 'month'), IS_SAME({${ATTENDANCE_SESSION_FIELDS.CHECK_IN}}, '${monthStart}', 'month'), IS_SAME({${ATTENDANCE_SESSION_FIELDS.CHECK_OUT}}, '${monthStart}', 'month'))`,
            {
              fields: [
                ATTENDANCE_SESSION_FIELDS.MEMBER,
                ATTENDANCE_SESSION_FIELDS.DATE,
                ATTENDANCE_SESSION_FIELDS.CHECK_IN,
                ATTENDANCE_SESSION_FIELDS.CHECK_OUT,
              ],
              maxRecords: 2000,
              revalidate: 60,
              tags: ["attendance", "attendance-sessions"],
            }
          ).catch((e) => {
            console.error("Attendance sessions fetch failed:", e.message);
            return [];
          }),

          // 2. Fetch from سجل الحضور (Raw Gate Scans)
          getRecordsByFilter(
            TABLES.ATTENDANCE,
            `IS_SAME({${ATTENDANCE_FIELDS.ENTRY_TIME}}, '${monthStart}', 'month')`,
            {
              fields: [
                ATTENDANCE_FIELDS.MEMBER,
                ATTENDANCE_FIELDS.ENTRY_TIME,
                ATTENDANCE_FIELDS.GATE_DECISION,
              ],
              maxRecords: 2000,
              revalidate: 60,
              tags: ["attendance", "attendance-raw"],
            }
          ).catch((e) => {
            console.error("Raw attendance fetch failed:", e.message);
            return [];
          }),
        ]);

        const sessions = sessionRecords.map((r) => {
          const rawMember = r.fields[ATTENDANCE_SESSION_FIELDS.MEMBER];
          const memberIds = Array.isArray(rawMember)
            ? (rawMember as string[])
            : typeof rawMember === "string"
              ? [rawMember]
              : [];
          const inVal =
            (r.fields[ATTENDANCE_SESSION_FIELDS.CHECK_IN] as string) ||
            (r.fields[ATTENDANCE_SESSION_FIELDS.DATE] as string);
          const outVal = r.fields[ATTENDANCE_SESSION_FIELDS.CHECK_OUT] as string | undefined;

          return { memberIds, inStr: inVal, outStr: outVal };
        });

        const rawLogs = rawRecords.map((r) => {
          const rawMember = r.fields[ATTENDANCE_FIELDS.MEMBER];
          const memberIds = Array.isArray(rawMember)
            ? (rawMember as string[])
            : typeof rawMember === "string"
              ? [rawMember]
              : [];
          const dateVal =
            (r.fields[ATTENDANCE_FIELDS.ENTRY_TIME] as string) || r.createdTime;
          const decision = (r.fields[ATTENDANCE_FIELDS.GATE_DECISION] as string) || "";

          return { memberIds, dateStr: dateVal, decision };
        });

        return { sessions, rawLogs };
      },
      {
        ttlSeconds: 86400, // 24 hours
        softTtlSeconds: 3600, // 1 hour
        logTag: `attendance:month:${monthStart}`,
      }
    );

    const { sessions = [], rawLogs = [] } = cacheResult.data || {};
    const attendedDays = new Set<number>();

    // Check paired sessions (with midnight split support)
    for (const s of sessions) {
      if (!s.memberIds.includes(session.recordId)) continue;
      if (s.inStr) {
        const dIn = new Date(s.inStr);
        if (!isNaN(dIn.getTime()) && dIn.getFullYear() === year && dIn.getMonth() + 1 === month) {
          attendedDays.add(dIn.getDate());
        }
      }
      if (s.outStr && s.outStr !== s.inStr) {
        const dOut = new Date(s.outStr);
        if (!isNaN(dOut.getTime()) && dOut.getFullYear() === year && dOut.getMonth() + 1 === month) {
          attendedDays.add(dOut.getDate());
        }
      }
    }

    // Check raw gate logs
    for (const r of rawLogs) {
      if (!r.memberIds.includes(session.recordId)) continue;
      if (isDenied(r.decision)) continue;
      if (!r.dateStr) continue;
      const d = new Date(r.dateStr);
      if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month) {
        attendedDays.add(d.getDate());
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        year,
        month,
        attendedDays: Array.from(attendedDays).sort((a, b) => a - b),
      },
    });
  } catch (error) {
    console.error("Attendance fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch attendance" },
      { status: 500 }
    );
  }
}
