import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordById, getRecords, updateRecord, deleteRecord } from "@/lib/airtable";
import { TABLES, CLASS_FIELDS, WAITING_LIST_FIELDS } from "@/lib/constants";
import { invalidateEventsCache } from "@/lib/cacheService";
import { promoteClassWaitingList } from "@/lib/waitingListService";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const classRecord = await getRecordById(TABLES.CLASSES, id);
    if (!classRecord) {
      return NextResponse.json({ message: "Class not found" }, { status: 404 });
    }

    const memberIds =
      (classRecord.fields[CLASS_FIELDS.MEMBERS] as string[] | undefined) || [];

    // Find waiting list records for this class
    const waitRecords = await getRecords(TABLES.WAITING_LIST);
    const classWaitEntries = waitRecords.filter((w) => {
      const classIds = (w.fields[WAITING_LIST_FIELDS.CLASS] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      return (classIds.includes(id) || notes === id) && w.fields[WAITING_LIST_FIELDS.STATUS] === "بالانتظار";
    });

    const isEnrolled = memberIds.includes(user.recordId);
    const myWaitEntry = classWaitEntries.find((w) => {
      const mIds = (w.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
      return mIds.includes(user.recordId);
    });

    if (!isEnrolled && !myWaitEntry) {
      return NextResponse.json(
        { message: "You are not registered or on the waiting list for this class" },
        { status: 404 }
      );
    }

    const capacity = Number(classRecord.fields[CLASS_FIELDS.CAPACITY]) || 0;
    const className = (classRecord.fields[CLASS_FIELDS.NAME] as string) || "الكلاس";

    // 1. If currently on waiting list -> leave waiting list
    if (!isEnrolled && myWaitEntry) {
      await deleteRecord(TABLES.WAITING_LIST, myWaitEntry.id);
      await invalidateEventsCache();
      return NextResponse.json({
        success: true,
        data: {
          classId: id,
          isJoined: false,
          isOnWaitingList: false,
          removedFromWaitingList: true,
          currentCount: memberIds.length,
          remaining: capacity > 0 ? Math.max(0, capacity - memberIds.length) : null,
        },
      });
    }

    // 2. If cancelling confirmed enrollment -> remove user, then auto-promote and notify
    const remainingMembers = memberIds.filter((m) => m !== user.recordId);
    await updateRecord(TABLES.CLASSES, id, {
      [CLASS_FIELDS.MEMBERS]: remainingMembers,
    });
    await invalidateEventsCache();

    const promoteRes = await promoteClassWaitingList({
      classId: id,
      capacity,
      currentMembers: remainingMembers,
      className,
    });

    const finalMembers = promoteRes.updatedMembers;

    return NextResponse.json({
      success: true,
      message: "Successfully cancelled class registration",
      data: {
        classId: id,
        isJoined: false,
        isOnWaitingList: false,
        autoPromoted: promoteRes.promotedCount > 0,
        currentCount: finalMembers.length,
        remaining: capacity > 0 ? Math.max(0, capacity - finalMembers.length) : null,
      },
    });
  } catch (error) {
    console.error("Cancel class registration error:", error);
    return NextResponse.json(
      { message: "Failed to cancel class registration" },
      { status: 500 }
    );
  }
}
