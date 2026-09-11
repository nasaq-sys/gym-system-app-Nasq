import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordById, getRecords, updateRecord, deleteRecord } from "@/lib/airtable";
import { TABLES, FACILITY_BOOKING_FIELDS, WAITING_LIST_FIELDS, FACILITY_FIELDS } from "@/lib/constants";
import { invalidateEventsCache } from "@/lib/cacheService";
import { promoteFacilityWaitingList } from "@/lib/waitingListService";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const record = await getRecordById(TABLES.FACILITY_BOOKINGS, id);
    if (!record) {
      return NextResponse.json({ message: "Facility slot not found" }, { status: 404 });
    }

    const memberIds =
      (record.fields[FACILITY_BOOKING_FIELDS.MEMBER] as string[] | undefined) || [];

    // Find waiting list records for this slot
    const waitRecords = await getRecords(TABLES.WAITING_LIST);
    const myWaitEntry = waitRecords.find((w) => {
      const mIds = (w.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      return notes === id && mIds.includes(user.recordId) && w.fields[WAITING_LIST_FIELDS.STATUS] === "بالانتظار";
    });

    const isBooked = memberIds.includes(user.recordId);

    if (!isBooked && !myWaitEntry) {
      return NextResponse.json(
        { message: "You're not booked or on the waiting list for this slot" },
        { status: 404 }
      );
    }

    // 1. If currently on waiting list -> leave waiting list
    if (!isBooked && myWaitEntry) {
      await deleteRecord(TABLES.WAITING_LIST, myWaitEntry.id);
      await invalidateEventsCache();
      return NextResponse.json({
        success: true,
        data: { removedFromWaitingList: true },
      });
    }

    // 2. If cancelling confirmed booking -> remove user, then auto-promote and notify
    const remainingMembers = memberIds.filter((m) => m !== user.recordId);
    await updateRecord(TABLES.FACILITY_BOOKINGS, id, {
      [FACILITY_BOOKING_FIELDS.MEMBER]: remainingMembers,
    });
    await invalidateEventsCache();

    const capacity = Number(record.fields[FACILITY_BOOKING_FIELDS.CAPACITY]) || 0;
    const facilityIds = (record.fields[FACILITY_BOOKING_FIELDS.FACILITY] as string[] | undefined) || [];
    const period = (record.fields[FACILITY_BOOKING_FIELDS.PERIOD] as string) || "";

    let facilityName = "المرفق";
    if (facilityIds[0]) {
      const facRec = await getRecordById(TABLES.FACILITIES, facilityIds[0]).catch(() => null);
      if (facRec) {
        facilityName = (facRec.fields[FACILITY_FIELDS.NAME] as string) || (facRec.fields[FACILITY_FIELDS.TYPE] as string) || "المرفق";
      }
    }

    const promoteRes = await promoteFacilityWaitingList({
      bookingId: id,
      facilityId: facilityIds[0],
      capacity,
      currentMembers: remainingMembers,
      facilityName,
      period,
    });

    return NextResponse.json({
      success: true,
      data: {
        cancelled: true,
        autoPromoted: promoteRes.promotedCount > 0,
        currentMembers: promoteRes.updatedMembers,
      },
    });
  } catch (error) {
    console.error("Facility booking cancel error:", error);
    return NextResponse.json(
      { message: "Failed to cancel booking" },
      { status: 500 }
    );
  }
}
