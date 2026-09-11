import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { facilityBookingSchema } from "@/lib/validations/facilityBookingSchema";
import { getRecords, getRecordById, updateRecord, createRecord } from "@/lib/airtable";
import { TABLES, FACILITY_BOOKING_FIELDS, WAITING_LIST_FIELDS } from "@/lib/constants";
import { invalidateEventsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const facilityId = searchParams.get("facility");
    const date = searchParams.get("date") || todayStr();

    if (!facilityId) {
      return NextResponse.json({ message: "facility is required" }, { status: 400 });
    }

    const bookings = await getRecords(TABLES.FACILITY_BOOKINGS);

    const items = bookings
      .filter((r) => {
        const d = (r.fields[FACILITY_BOOKING_FIELDS.DATE] as string) || "";
        if (d.slice(0, 10) !== date) return false;
        const facIds = (r.fields[FACILITY_BOOKING_FIELDS.FACILITY] as string[] | undefined) || [];
        if (!facIds.includes(facilityId)) return false;
        return (r.fields[FACILITY_BOOKING_FIELDS.STATUS] as string) === "مؤكد";
      })
      .map((r) => {
        const memberIds =
          (r.fields[FACILITY_BOOKING_FIELDS.MEMBER] as string[] | undefined) || [];
        return {
          id: r.id,
          period: (r.fields[FACILITY_BOOKING_FIELDS.PERIOD] as string) || "",
          capacity: Number(r.fields[FACILITY_BOOKING_FIELDS.CAPACITY]) || 0,
          currentCount: memberIds.length,
          available: Number(r.fields[FACILITY_BOOKING_FIELDS.AVAILABLE]) || 0,
          bookedByMe: memberIds.includes(user.recordId),
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("Facility bookings fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch facility bookings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 2. Strict Input Validation & Anti-XSS Sanitization via Zod
    const validation = facilityBookingSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid booking data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { bookingId } = validation.data;
    const record = await getRecordById(TABLES.FACILITY_BOOKINGS, bookingId);
    if (!record) {
      return NextResponse.json({ message: "Slot not found" }, { status: 404 });
    }

    if ((record.fields[FACILITY_BOOKING_FIELDS.STATUS] as string) !== "مؤكد") {
      return NextResponse.json({ message: "Slot is not open" }, { status: 400 });
    }

    const memberIds =
      (record.fields[FACILITY_BOOKING_FIELDS.MEMBER] as string[] | undefined) || [];

    if (memberIds.includes(user.recordId)) {
      return NextResponse.json({ message: "Already booked" }, { status: 409 });
    }

    const facilityIds = (record.fields[FACILITY_BOOKING_FIELDS.FACILITY] as string[] | undefined) || [];
    const waitRecords = await getRecords(TABLES.WAITING_LIST);
    const existingWait = waitRecords.find((w) => {
      const mIds = (w.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      return notes === bookingId && mIds.includes(user.recordId) && w.fields[WAITING_LIST_FIELDS.STATUS] === "بالانتظار";
    });

    if (existingWait) {
      return NextResponse.json({ message: "Already on the waiting list" }, { status: 409 });
    }

    const capacity = Number(record.fields[FACILITY_BOOKING_FIELDS.CAPACITY]) || 0;

    // Available space -> Direct booking
    if (capacity <= 0 || memberIds.length < capacity) {
      await updateRecord(TABLES.FACILITY_BOOKINGS, bookingId, {
        [FACILITY_BOOKING_FIELDS.MEMBER]: [...memberIds, user.recordId],
      });
      await invalidateEventsCache();
      return NextResponse.json({
        success: true,
        message: "Successfully booked slot",
        data: { bookingId, isBooked: true, waitingList: false },
      });
    }

    // Full -> Join Waiting List
    const queueRecord = await createRecord(TABLES.WAITING_LIST, {
      [WAITING_LIST_FIELDS.FACILITY]: facilityIds.length > 0 ? facilityIds : undefined,
      [WAITING_LIST_FIELDS.MEMBER]: [user.recordId],
      [WAITING_LIST_FIELDS.STATUS]: "بالانتظار",
      [WAITING_LIST_FIELDS.REQUEST_DATE]: new Date().toISOString(),
      [WAITING_LIST_FIELDS.NOTES]: bookingId,
    });

    await invalidateEventsCache();

    return NextResponse.json({
      success: true,
      message: "Added to waiting list",
      data: { bookingId, isBooked: false, waitingList: true, queueId: queueRecord.id },
    });
  } catch (error) {
    console.error("Facility booking create error:", error);
    return NextResponse.json(
      { message: "Failed to book slot" },
      { status: 500 }
    );
  }
}
