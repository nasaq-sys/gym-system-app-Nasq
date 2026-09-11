import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { classJoinSchema } from "@/lib/validations/classJoinSchema";
import { getRecordById, getRecords, createRecord, updateRecord } from "@/lib/airtable";
import { TABLES, CLASS_FIELDS, WAITING_LIST_FIELDS } from "@/lib/constants";
import { invalidateEventsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const validation = classJoinSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "validation_failed",
          message: validation.error.issues[0]?.message || "Invalid class data",
        },
        { status: 400 }
      );
    }

    const { classId } = validation.data;
    const classRecord = await getRecordById(TABLES.CLASSES, classId);
    if (!classRecord) {
      return NextResponse.json({ message: "Class not found" }, { status: 404 });
    }

    const memberIds =
      (classRecord.fields[CLASS_FIELDS.MEMBERS] as string[] | undefined) || [];
    if (memberIds.includes(user.recordId)) {
      return NextResponse.json(
        { message: "Already registered" },
        { status: 400 }
      );
    }

    // Check if member is already in waiting list for this class
    const waitRecords = await getRecords(TABLES.WAITING_LIST);
    const existingWait = waitRecords.find((w) => {
      const classIds = (w.fields[WAITING_LIST_FIELDS.CLASS] as string[] | undefined) || [];
      const mIds = (w.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
      return (
        classIds.includes(classId) &&
        mIds.includes(user.recordId) &&
        w.fields[WAITING_LIST_FIELDS.STATUS] === "بالانتظار"
      );
    });

    if (existingWait) {
      return NextResponse.json(
        { message: "Already on the waiting list" },
        { status: 409 }
      );
    }

    const capacity = Number(classRecord.fields[CLASS_FIELDS.CAPACITY]) || 0;
    const currentCount = memberIds.length;

    // Available space -> Direct registration
    if (capacity <= 0 || currentCount < capacity) {
      const updatedMembers = [...memberIds, user.recordId];
      await updateRecord(TABLES.CLASSES, classId, {
        [CLASS_FIELDS.MEMBERS]: updatedMembers,
      });

      await invalidateEventsCache();

      return NextResponse.json({
        success: true,
        message: "Successfully joined class",
        data: {
          classId,
          isJoined: true,
          isOnWaitingList: false,
          waitingList: false,
          currentCount: updatedMembers.length,
          remaining: capacity > 0 ? Math.max(0, capacity - updatedMembers.length) : null,
        },
      });
    }

    // Full -> Join Waiting List
    const queueRecord = await createRecord(TABLES.WAITING_LIST, {
      [WAITING_LIST_FIELDS.CLASS]: [classId],
      [WAITING_LIST_FIELDS.MEMBER]: [user.recordId],
      [WAITING_LIST_FIELDS.STATUS]: "بالانتظار",
      [WAITING_LIST_FIELDS.REQUEST_DATE]: new Date().toISOString(),
    });

    await invalidateEventsCache();

    return NextResponse.json({
      success: true,
      message: "Added to waiting list",
      data: {
        classId,
        isJoined: false,
        isOnWaitingList: true,
        waitingList: true,
        queueId: queueRecord.id,
        currentCount,
        remaining: capacity > 0 ? Math.max(0, capacity - currentCount) : null,
      },
    });
  } catch (error) {
    console.error("Join class error:", error);
    return NextResponse.json(
      { message: "Failed to join class" },
      { status: 500 }
    );
  }
}
