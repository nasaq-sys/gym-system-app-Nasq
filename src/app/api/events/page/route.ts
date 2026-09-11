import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import {
  TABLES,
  EVENT_FIELDS,
  FACILITY_FIELDS,
  FACILITY_BOOKING_FIELDS,
  CLASS_FIELDS,
  TRAINER_FIELDS,
  WAITING_LIST_FIELDS,
} from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

function toNumber(value: unknown): number {
  const s = String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodEndMinutes(period: string): number | null {
  const m = period.match(/-\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

const BOOKING_CONFIRMED = "مؤكد";
const WAITING_STATUS = "بالانتظار";

interface RawEventsBundle {
  events: Array<{ id: string; fields: Record<string, unknown> }>;
  facilities: Array<{ id: string; fields: Record<string, unknown> }>;
  classes: Array<{ id: string; fields: Record<string, unknown> }>;
  bookings: Array<{ id: string; fields: Record<string, unknown> }>;
  trainers: Array<{ id: string; fields: Record<string, unknown> }>;
  waitRecords: Array<{ id: string; fields: Record<string, unknown> }>;
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCacheSWR<RawEventsBundle>(
      REDIS_KEYS.EVENTS_PAGE,
      async () => {
        const [events, facilities, classes, bookings, trainers, waitRecords] =
          await Promise.all([
            getRecords(TABLES.EVENTS, { tags: ["events"] }),
            getRecords(TABLES.FACILITIES, { revalidate: 300, tags: ["facilities"] }),
            getRecords(TABLES.CLASSES, { tags: ["classes"] }),
            getRecords(TABLES.FACILITY_BOOKINGS, { tags: ["facility_bookings"] }),
            getRecords(TABLES.TRAINERS, { revalidate: 120, tags: ["trainers"] }),
            getRecords(TABLES.WAITING_LIST, { tags: ["waiting_list"] }),
          ]);

        return {
          events,
          facilities,
          classes,
          bookings,
          trainers,
          waitRecords,
        };
      },
      {
        ttlSeconds: 86400, // 24 hours hard TTL
        softTtlSeconds: 900, // 15 minutes soft TTL
        logTag: "events:page",
      }
    );

    const { events, facilities, classes, bookings, trainers, waitRecords } = result.data;

    const trainerById = new Map(
      trainers.map((t) => [t.id, t.fields[TRAINER_FIELDS.NAME]])
    );

    const waitingByEvent = new Map<string, string[]>();
    const waitingByClass = new Map<string, string[]>();
    const waitingByFacilitySlot = new Map<string, string[]>();
    for (const w of waitRecords) {
      if (w.fields[WAITING_LIST_FIELDS.STATUS] !== WAITING_STATUS) continue;
      const type = w.fields[WAITING_LIST_FIELDS.TYPE];
      const memberIds = (w.fields[WAITING_LIST_FIELDS.MEMBER] || []) as string[];

      // Linked to Event
      const eventIds = (w.fields[WAITING_LIST_FIELDS.EVENT] || []) as string[];
      for (const eid of eventIds) {
        const arr = waitingByEvent.get(eid) ?? [];
        arr.push(...memberIds);
        waitingByEvent.set(eid, arr);
      }

      // Linked to Class
      const classIds = (w.fields[WAITING_LIST_FIELDS.CLASS] || []) as string[];
      for (const cid of classIds) {
        const arr = waitingByClass.get(cid) ?? [];
        arr.push(...memberIds);
        waitingByClass.set(cid, arr);
      }

      // Linked to Facility Slot
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      if (notes) {
        const arr = waitingByFacilitySlot.get(notes) ?? [];
        arr.push(...memberIds);
        waitingByFacilitySlot.set(notes, arr);
      }
    }

    const today = todayStr();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const eventList = events
      .filter((r) => {
        const status = (r.fields[EVENT_FIELDS.STATUS] as string) || "";
        if (
          status === "مكتملة" ||
          status.includes("مكتمل") ||
          status.includes("منتهي") ||
          status.includes("ملغ")
        ) {
          return false;
        }
        const date = String(r.fields[EVENT_FIELDS.DATE] || "").slice(0, 10);
        if (date && date < today) {
          return false;
        }
        return true;
      })
      .map((r) => {
        const registrants = (r.fields[EVENT_FIELDS.REGISTRANTS] || []) as string[];
        return {
          id: r.id,
          number: r.fields[EVENT_FIELDS.NUMBER],
          name: r.fields[EVENT_FIELDS.NAME],
          type: r.fields[EVENT_FIELDS.TYPE],
          date: r.fields[EVENT_FIELDS.DATE],
          startTime: r.fields[EVENT_FIELDS.START_TIME],
          endTime: r.fields[EVENT_FIELDS.END_TIME],
          location: r.fields[EVENT_FIELDS.LOCATION],
          status: r.fields[EVENT_FIELDS.STATUS],
          fee: r.fields[EVENT_FIELDS.FEE],
          prize: r.fields[EVENT_FIELDS.PRIZE],
          notes: r.fields[EVENT_FIELDS.NOTES],
          count: toNumber(r.fields[EVENT_FIELDS.PARTICIPANT_COUNT]),
          max: toNumber(r.fields[EVENT_FIELDS.MAX_PARTICIPANTS]),
          isRegistered: registrants.includes(user.recordId),
          isOnWaitingList: (waitingByEvent.get(r.id) ?? []).includes(user.recordId),
        };
      })
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    const facilityById = new Map(facilities.map((f) => [f.id, f]));

    const facilityList = bookings
      .filter((b) => {
        if (b.fields[FACILITY_BOOKING_FIELDS.STATUS] !== BOOKING_CONFIRMED) return false;
        const date = String(b.fields[FACILITY_BOOKING_FIELDS.DATE] || "").slice(0, 10);
        if (date < today) return false;
        if (date === today) {
          const endMin = periodEndMinutes(
            String(b.fields[FACILITY_BOOKING_FIELDS.PERIOD] || "")
          );
          if (endMin !== null && nowMinutes >= endMin) return false;
        }
        return true;
      })
      .map((b) => {
        const facilityIds = (b.fields[FACILITY_BOOKING_FIELDS.FACILITY] as string[] | undefined) ?? [];
        const facility = facilityById.get(facilityIds[0]);
        const memberIds = (b.fields[FACILITY_BOOKING_FIELDS.MEMBER] as string[] | undefined) ?? [];
        return {
          id: b.id,
          number: facility?.fields[FACILITY_FIELDS.NUMBER],
          name:
            facility?.fields[FACILITY_FIELDS.NAME] ||
            facility?.fields[FACILITY_FIELDS.TYPE] ||
            "",
          type: facility?.fields[FACILITY_FIELDS.TYPE],
          date: b.fields[FACILITY_BOOKING_FIELDS.DATE],
          period: b.fields[FACILITY_BOOKING_FIELDS.PERIOD],
          capacity: toNumber(b.fields[FACILITY_BOOKING_FIELDS.CAPACITY]),
          currentCount: memberIds.length,
          available: toNumber(b.fields[FACILITY_BOOKING_FIELDS.AVAILABLE]),
          isBookedByMe: memberIds.includes(user.recordId),
          isOnWaitingList: (waitingByFacilitySlot.get(b.id) ?? []).includes(user.recordId),
        };
      })
      .sort(
        (a, b) =>
          String(a.date || "").localeCompare(String(b.date || "")) ||
          String(a.period || "").localeCompare(String(b.period || "")) ||
          Number(a.number || 0) - Number(b.number || 0)
      );

    const classList = classes
      .filter((r) => {
        const courseStatus = (r.fields[CLASS_FIELDS.COURSE_STATUS] as string) || "";
        if (
          courseStatus === "منتهي" ||
          courseStatus.includes("منتهي") ||
          courseStatus.includes("ملغ")
        ) {
          return false;
        }
        const status = (r.fields[CLASS_FIELDS.STATUS] as string) || "";
        if (status.includes("منتهي") || status.includes("ملغ")) {
          return false;
        }
        const courseEnd = String(r.fields[CLASS_FIELDS.COURSE_END] || "").slice(0, 10);
        if (courseEnd && courseEnd < today) {
          return false;
        }
        return true;
      })
      .map((r) => {
        const memberIds = (r.fields[CLASS_FIELDS.MEMBERS] as string[] | undefined) || [];
        const trainerIds = (r.fields[CLASS_FIELDS.TRAINER] as string[] | undefined) || [];
        return {
          id: r.id,
          name: r.fields[CLASS_FIELDS.NAME],
          level: r.fields[CLASS_FIELDS.LEVEL],
          days: r.fields[CLASS_FIELDS.DAYS],
          startTime: r.fields[CLASS_FIELDS.START_TIME],
          endTime: r.fields[CLASS_FIELDS.END_TIME],
          duration: r.fields[CLASS_FIELDS.DURATION],
          trainerName: trainerById.get(trainerIds[0]) ?? "",
          courseStart: r.fields[CLASS_FIELDS.COURSE_START],
          courseEnd: r.fields[CLASS_FIELDS.COURSE_END],
          sessionsPerWeek: r.fields[CLASS_FIELDS.SESSIONS_PER_WEEK],
          capacity: toNumber(r.fields[CLASS_FIELDS.CAPACITY]),
          currentCount: toNumber(r.fields[CLASS_FIELDS.CURRENT_COUNT]),
          remaining: toNumber(r.fields[CLASS_FIELDS.REMAINING]),
          status: r.fields[CLASS_FIELDS.STATUS],
          courseStatus: r.fields[CLASS_FIELDS.COURSE_STATUS],
          isJoined: memberIds.includes(user.recordId),
          isOnWaitingList: (waitingByClass.get(r.id) ?? []).includes(user.recordId),
        };
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    return NextResponse.json(
      {
        success: true,
        source: result.source,
        latencyMs: result.latencyMs,
        data: {
          events: eventList,
          facilities: facilityList,
          classes: classList,
          registration: {
            tableExists: true,
            waitingListExists: true,
          },
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
          "X-Cache-Source": result.source,
          "X-Cache-Latency": `${result.latencyMs}ms`,
        },
      }
    );
  } catch (error) {
    console.error("Events page fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch events page" },
      { status: 500 }
    );
  }
}
