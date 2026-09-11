import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRecordsByFilter } from "@/lib/airtable";
import { TABLES, ATTENDANCE_SESSION_FIELDS, ATTENDANCE_FIELDS } from "@/lib/constants";

function classify(decision: unknown): "allowed" | "denied" | "exit" {
  if (!decision) return "allowed";
  const str = String(decision);
  if (str.includes("❌") || str.includes("مرفوض") || str.includes("غير مسموح"))
    return "denied";
  if (str.includes("خروج") || str.includes("🚪")) return "exit";
  return "allowed";
}

/**
 * Clips an interval [inMs, outMs] to the target day bounds [dayStartMs, dayEndMs].
 * Handles sessions crossing midnight (e.g. 23:00 to 01:30) so time before midnight
 * is allocated to Day 1, and time after midnight is allocated to Day 2.
 */
function clipIntervalToDay(
  inMs: number,
  outMs: number,
  dayStartMs: number,
  dayEndMs: number
): [number, number] | null {
  const effectiveIn = Math.max(inMs, dayStartMs);
  const effectiveOut = Math.min(outMs, dayEndMs);
  if (effectiveOut > effectiveIn) {
    return [effectiveIn, effectiveOut];
  }
  return null;
}

/**
 * Merge overlapping time intervals [startMs, endMs] and calculate total non-overlapping minutes.
 * Maximum single continuous session duration is capped at 240 minutes (4 hours)
 * to prevent runaway times when an exit scan is forgotten or scanned the next morning.
 */
function mergeAndSumIntervals(intervals: [number, number][], maxSingleSessionMins = 240): number {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  let current: [number, number] = [intervals[0][0], intervals[0][1]];

  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start <= current[1]) {
      current[1] = Math.max(current[1], end);
    } else {
      merged.push(current);
      current = [start, end];
    }
  }
  merged.push(current);

  let totalMins = 0;
  for (const [start, end] of merged) {
    const diffMins = Math.round((end - start) / 60000);
    totalMins += Math.min(diffMins, maxSingleSessionMins);
  }
  return totalMins;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ message: "Invalid or missing date" }, { status: 400 });
  }

  try {
    const dayStartMs = new Date(date + "T00:00:00Z").getTime();
    const dayEndMs = new Date(date + "T23:59:59.999Z").getTime();

    // Previous day calculation (to fetch overnight sessions starting yesterday)
    const prevDateObj = new Date(dayStartMs - 86400000);
    const prevDateStr = prevDateObj.toISOString().slice(0, 10);

    const todayStr = new Date().toISOString().slice(0, 10);
    const isToday = date === todayStr;

    // Fetch paired sessions (including yesterday for overnight splits) and raw gate scans in parallel
    const [sessionRecords, rawRecords] = await Promise.all([
      getRecordsByFilter(
        TABLES.ATTENDANCE_SESSIONS,
        `OR(IS_SAME({${ATTENDANCE_SESSION_FIELDS.DATE}}, '${date}', 'day'), IS_SAME({${ATTENDANCE_SESSION_FIELDS.CHECK_IN}}, '${date}', 'day'), IS_SAME({${ATTENDANCE_SESSION_FIELDS.CHECK_OUT}}, '${date}', 'day'), IS_SAME({${ATTENDANCE_SESSION_FIELDS.CHECK_IN}}, '${prevDateStr}', 'day'))`,
        {
          fields: [
            ATTENDANCE_SESSION_FIELDS.MEMBER,
            ATTENDANCE_SESSION_FIELDS.CHECK_IN,
            ATTENDANCE_SESSION_FIELDS.CHECK_OUT,
            ATTENDANCE_SESSION_FIELDS.DURATION_MINUTES,
          ],
          maxRecords: 2000,
          revalidate: 30,
          tags: ["attendance-sessions"],
        }
      ).catch((e) => {
        console.error("Attendance session fetch failed:", e.message);
        return [];
      }),

      getRecordsByFilter(
        TABLES.ATTENDANCE,
        `OR(IS_SAME({${ATTENDANCE_FIELDS.ENTRY_TIME}}, '${date}', 'day'), IS_SAME({${ATTENDANCE_FIELDS.ENTRY_TIME}}, '${prevDateStr}', 'day'))`,
        {
          fields: [
            ATTENDANCE_FIELDS.MEMBER,
            ATTENDANCE_FIELDS.ENTRY_TIME,
            ATTENDANCE_FIELDS.GATE_DECISION,
            "lookup_دقائق_الجلسة",
          ],
          maxRecords: 2000,
          revalidate: 30,
          tags: ["attendance-raw"],
        }
      ).catch((e) => {
        console.error("Raw attendance fetch failed:", e.message);
        return [];
      }),
    ]);

    let hasAttendance = false;
    let isLive = false;
    let firstEntry: string | null = null;
    let lastExit: string | null = null;
    const intervals: [number, number][] = [];

    // 1. Evaluate paired sessions from جلسات الحضور (with midnight split clipping)
    for (const r of sessionRecords) {
      const memberLinks = r.fields[ATTENDANCE_SESSION_FIELDS.MEMBER];
      const linkedIds = Array.isArray(memberLinks)
        ? (memberLinks as string[])
        : typeof memberLinks === "string"
          ? [memberLinks]
          : [];
      if (!linkedIds.includes(session.recordId)) continue;

      const inTime = r.fields[ATTENDANCE_SESSION_FIELDS.CHECK_IN] as string | undefined;
      const outTime = r.fields[ATTENDANCE_SESSION_FIELDS.CHECK_OUT] as string | undefined;
      if (!inTime && !outTime) continue;

      const inMs = inTime ? new Date(inTime).getTime() : 0;
      const outMs = outTime ? new Date(outTime).getTime() : inMs;

      // Check if session touches this day's boundary
      if (inMs <= dayEndMs && outMs >= dayStartMs) {
        hasAttendance = true;

        if (inMs >= dayStartMs && inMs <= dayEndMs) {
          if (!firstEntry || inMs < new Date(firstEntry).getTime()) {
            firstEntry = inTime || null;
          }
        } else if (inMs < dayStartMs) {
          // Started yesterday and continued past midnight
          if (!firstEntry) {
            firstEntry = inTime || null; // Keep original check-in time reference
          }
        }

        if (outMs >= dayStartMs && outMs <= dayEndMs && outMs !== inMs) {
          if (!lastExit || outMs > new Date(lastExit).getTime()) {
            lastExit = outTime || null;
          }
        }

        if (outMs > inMs) {
          const clipped = clipIntervalToDay(inMs, outMs, dayStartMs, dayEndMs);
          if (clipped) {
            intervals.push(clipped);
          }
        }
      }
    }

    // 2. Evaluate raw gate scans from سجل الحضور
    const rawEntries: number[] = [];
    const rawExits: number[] = [];

    for (const r of rawRecords) {
      const memberLinks = r.fields[ATTENDANCE_FIELDS.MEMBER];
      const linkedIds = Array.isArray(memberLinks)
        ? (memberLinks as string[])
        : typeof memberLinks === "string"
          ? [memberLinks]
          : [];
      if (!linkedIds.includes(session.recordId)) continue;

      const decision = r.fields[ATTENDANCE_FIELDS.GATE_DECISION];
      const kind = classify(decision);
      if (kind === "denied") continue;

      const scanTime = (r.fields[ATTENDANCE_FIELDS.ENTRY_TIME] as string) || r.createdTime;
      if (!scanTime) continue;
      const scanTimeMs = new Date(scanTime).getTime();

      if (scanTimeMs >= dayStartMs && scanTimeMs <= dayEndMs) {
        hasAttendance = true;

        if (kind === "exit") {
          rawExits.push(scanTimeMs);
          if (!lastExit || scanTimeMs > new Date(lastExit).getTime()) {
            lastExit = scanTime;
          }
        } else {
          rawEntries.push(scanTimeMs);
          if (!firstEntry || scanTimeMs < new Date(firstEntry).getTime()) {
            firstEntry = scanTime;
          }
        }
      }
    }

    if (rawEntries.length > 0 && rawExits.length > 0) {
      const minIn = Math.min(...rawEntries);
      const maxOut = Math.max(...rawExits);
      if (maxOut > minIn) {
        const clipped = clipIntervalToDay(minIn, maxOut, dayStartMs, dayEndMs);
        if (clipped) {
          intervals.push(clipped);
        }
      }
    }

    // 3. Compute merged non-overlapping minutes for THIS day (capped at 240 mins max)
    let totalMinutes = mergeAndSumIntervals(intervals, 240);

    // If totalMinutes is still 0 but we have valid firstEntry & lastExit on this day:
    if (totalMinutes === 0 && firstEntry && lastExit) {
      const inMs = new Date(firstEntry).getTime();
      const outMs = new Date(lastExit).getTime();
      const clipped = clipIntervalToDay(inMs, outMs, dayStartMs, dayEndMs);
      if (clipped) {
        const diff = Math.round((clipped[1] - clipped[0]) / 60000);
        if (diff > 0) {
          totalMinutes = Math.min(diff, 240);
        }
      }
    }

    // 4. Live attendance check for today
    if (hasAttendance && isToday && firstEntry) {
      const now = Date.now();
      const entryTimeMs = new Date(firstEntry).getTime();
      const liveStartMs = Math.max(entryTimeMs, dayStartMs);
      const elapsed = Math.max(1, Math.round((now - liveStartMs) / 60000));

      const exitTimeMs = lastExit ? new Date(lastExit).getTime() : 0;
      if ((!lastExit || Math.abs(exitTimeMs - entryTimeMs) < 60000) && elapsed < 360) {
        isLive = true;
        totalMinutes = Math.min(elapsed, 240);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        date,
        totalMinutes,
        hasAttendance,
        isLive,
        firstEntry,
        lastExit,
      },
    });
  } catch (error) {
    console.error("Attendance day fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch attendance for day" },
      { status: 500 }
    );
  }
}
