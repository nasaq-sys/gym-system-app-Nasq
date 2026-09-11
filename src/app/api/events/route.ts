import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { eventRegistrationSchema } from "@/lib/validations/eventRegistrationSchema";
import { getRecords, getRecordById, createRecord, updateRecord, deleteRecord } from "@/lib/airtable";
import { invalidateEventsCache } from "@/lib/cacheService";
import { promoteEventWaitingList } from "@/lib/waitingListService";
import {
  TABLES,
  EVENT_FIELDS,
  WAITING_LIST_FIELDS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number {
  const s = String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

const WAITING_STATUS = "بالانتظار";

import { withCacheSWR } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cacheResult = await withCacheSWR(
      "ultra-gym:events:all",
      async () => {
        return await getRecords(TABLES.EVENTS);
      },
      {
        ttlSeconds: 86400,
        softTtlSeconds: 900,
        logTag: "events:all",
      }
    );

    const records = cacheResult.data || [];
    const today = new Date().toISOString().slice(0, 10);
    const events = records
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
        const registrants = strArray(r.fields[EVENT_FIELDS.REGISTRANTS]);
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
          maxParticipants: r.fields[EVENT_FIELDS.MAX_PARTICIPANTS],
          participantCount: r.fields[EVENT_FIELDS.PARTICIPANT_COUNT],
          prize: r.fields[EVENT_FIELDS.PRIZE],
          notes: r.fields[EVENT_FIELDS.NOTES],
          isRegistered: registrants.includes(user.recordId),
        };
      });

    events.sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );

    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    console.error("Events fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

interface WaitEntry {
  id: string;
  memberId: string | null;
  date: string;
}

async function loadWaitEntries(
  eventId: string
): Promise<{ entries: WaitEntry[]; queueIds: string[] }> {
  const waitRecords = await getRecords(TABLES.WAITING_LIST);
  const queueIds = strArray(
    (await getRecordById(TABLES.EVENTS, eventId)).fields[
      EVENT_FIELDS.WAITING_LIST
    ]
  );
  const byId = new Map(waitRecords.map((r) => [r.id, r]));
  const entries: WaitEntry[] = [];
  for (const id of queueIds) {
    const rec = byId.get(id);
    if (!rec) continue;
    const eventIds = strArray(rec.fields[WAITING_LIST_FIELDS.EVENT]);
    if (!eventIds.includes(eventId)) continue;
    const memberIds = strArray(rec.fields[WAITING_LIST_FIELDS.MEMBER]);
    entries.push({
      id: rec.id,
      memberId: memberIds[0] ?? null,
      date: String(
        rec.fields[WAITING_LIST_FIELDS.REQUEST_DATE] ||
          rec.createdTime ||
          ""
      ),
    });
  }
  // First come, first served
  entries.sort(
    (a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime() ||
      a.id.localeCompare(b.id)
  );
  return { entries, queueIds };
}

export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  // 2. Strict Input Validation via Zod
  const validation = eventRegistrationSchema.safeParse(rawBody);
  if (!validation.success) {
    const errorDetails = validation.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      {
        error: "validation_failed",
        message: errorDetails[0]?.message || "Invalid event ID",
        details: errorDetails,
      },
      { status: 400 }
    );
  }

  const { eventId } = validation.data;

  try {
    const event = await getRecordById(TABLES.EVENTS, eventId);
    const registrants = strArray(event.fields[EVENT_FIELDS.REGISTRANTS]);
    const max = toNumber(event.fields[EVENT_FIELDS.MAX_PARTICIPANTS]);
    const count = toNumber(event.fields[EVENT_FIELDS.PARTICIPANT_COUNT]);

    const { entries } = await loadWaitEntries(eventId);
    const alreadyWaiting = entries.some((e) => e.memberId === user.recordId);

    if (registrants.includes(user.recordId)) {
      return NextResponse.json(
        { message: "Already registered" },
        { status: 409 }
      );
    }

    if (alreadyWaiting) {
      return NextResponse.json(
        { message: "Already on the waiting list" },
        { status: 409 }
      );
    }

    // Open capacity → register the member
    if (max <= 0 || count < max) {
      await updateRecord(TABLES.EVENTS, eventId, {
        [EVENT_FIELDS.REGISTRANTS]: [...registrants, user.recordId],
        [EVENT_FIELDS.PARTICIPANT_COUNT]: count + 1,
      });
      await invalidateEventsCache();
      return NextResponse.json({
        success: true,
        data: { waitingList: false },
      });
    }

    // Full → join the waiting list (queue record on this event's own record)
    const queueRecord = await createRecord(TABLES.WAITING_LIST, {
      [WAITING_LIST_FIELDS.TYPE]: "فعالية",
      [WAITING_LIST_FIELDS.EVENT]: [eventId],
      [WAITING_LIST_FIELDS.MEMBER]: [user.recordId],
      [WAITING_LIST_FIELDS.STATUS]: WAITING_STATUS,
      [WAITING_LIST_FIELDS.REQUEST_DATE]: new Date().toISOString(),
    });

    await invalidateEventsCache();

    return NextResponse.json({
      success: true,
      data: { waitingList: true, queueId: queueRecord.id },
    });
  } catch (error) {
    console.error("Event registration error:", error);
    return NextResponse.json(
      { message: "Failed to register for event" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  // 2. Strict Input Validation via Zod
  const validation = eventRegistrationSchema.safeParse(rawBody);
  if (!validation.success) {
    const errorDetails = validation.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      {
        error: "validation_failed",
        message: errorDetails[0]?.message || "Invalid event ID",
        details: errorDetails,
      },
      { status: 400 }
    );
  }

  const { eventId } = validation.data;

  try {
    const event = await getRecordById(TABLES.EVENTS, eventId);
    const registrants = strArray(event.fields[EVENT_FIELDS.REGISTRANTS]);
    const count = toNumber(event.fields[EVENT_FIELDS.PARTICIPANT_COUNT]);
    const { entries } = await loadWaitEntries(eventId);

    const memberIsRegistered = registrants.includes(user.recordId);
    const myWaitEntry = entries.find((e) => e.memberId === user.recordId);

    if (!memberIsRegistered && !myWaitEntry) {
      return NextResponse.json(
        { message: "You're not registered for this event" },
        { status: 404 }
      );
    }

    // Leaving the waiting list
    if (!memberIsRegistered && myWaitEntry) {
      await deleteRecord(TABLES.WAITING_LIST, myWaitEntry.id);
      return NextResponse.json({
        success: true,
        data: { removedFromWaitingList: true },
      });
    }

    // Cancelling a confirmed registration → remove user, auto-promote from waiting list, and notify
    const remainingRegistrants = registrants.filter(
      (id) => id !== user.recordId
    );
    const max = toNumber(event.fields[EVENT_FIELDS.MAX_PARTICIPANTS]);
    const eventName = (event.fields[EVENT_FIELDS.NAME] as string) || "الفعالية";

    await updateRecord(TABLES.EVENTS, eventId, {
      [EVENT_FIELDS.REGISTRANTS]: remainingRegistrants,
      [EVENT_FIELDS.PARTICIPANT_COUNT]: remainingRegistrants.length,
    });
    await invalidateEventsCache();

    const promoteRes = await promoteEventWaitingList({
      eventId,
      maxParticipants: max,
      currentRegistrants: remainingRegistrants,
      eventName,
    });

    const finalRegistrants = promoteRes.updatedRegistrants;

    return NextResponse.json({
      success: true,
      data: {
        cancelled: true,
        autoPromoted: promoteRes.promotedCount > 0,
        registrants: finalRegistrants,
      },
    });
  } catch (error) {
    console.error("Event cancellation error:", error);
    return NextResponse.json(
      { message: "Failed to cancel event registration" },
      { status: 500 }
    );
  }
}

