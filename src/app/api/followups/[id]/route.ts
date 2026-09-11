import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordById, updateRecord, deleteRecord } from "@/lib/airtable";
import { TABLES, FOLLOWUP_FIELDS } from "@/lib/constants";
import { isPlanManagedByTrainer } from "@/lib/trainingSchedule";
import { followupSchema } from "@/lib/validations/followupSchema";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function assertOwnership(id: string, memberRecordId: string) {
  try {
    const record = await getRecordById(TABLES.FOLLOWUPS, id);
    if (!record) return false;
    const memberLinks = record.fields[FOLLOWUP_FIELDS.MEMBER];
    const linkedIds = Array.isArray(memberLinks)
      ? (memberLinks as string[])
      : typeof memberLinks === "string"
        ? [memberLinks]
        : [];
    return linkedIds.includes(memberRecordId);
  } catch (err) {
    console.error("assertOwnership error for followup:", err);
    return false;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const owns = await assertOwnership(id, user.recordId);
    if (!owns) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (await isPlanManagedByTrainer(user.recordId)) {
      return NextResponse.json(
        { message: "مدربك يدير متابعتك حالياً ولا يمكنك تعديل القياسات" },
        { status: 403 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const validation = followupSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        { error: "validation_failed", message: validation.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const data = validation.data;
    const fields: Record<string, unknown> = {};
    if (data.date !== undefined) fields[FOLLOWUP_FIELDS.DATE] = data.date;
    if (data.weight !== undefined) fields[FOLLOWUP_FIELDS.WEIGHT] = String(data.weight);
    if (data.bodyFat !== undefined) fields[FOLLOWUP_FIELDS.BODY_FAT] = String(data.bodyFat);
    if (data.waist !== undefined) fields[FOLLOWUP_FIELDS.WAIST] = String(data.waist);
    if (data.chest !== undefined) fields[FOLLOWUP_FIELDS.CHEST] = String(data.chest);
    if (data.arm !== undefined) fields[FOLLOWUP_FIELDS.ARM] = String(data.arm);
    if (data.thigh !== undefined) fields[FOLLOWUP_FIELDS.THIGH] = String(data.thigh);
    if (data.memberNotes !== undefined) fields[FOLLOWUP_FIELDS.MEMBER_NOTES] = data.memberNotes;

    const record = await updateRecord(TABLES.FOLLOWUPS, id, fields);
    await invalidateWorkoutsCache(user.recordId);

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        number: record.fields[FOLLOWUP_FIELDS.NUMBER] as number | undefined,
        date: (record.fields[FOLLOWUP_FIELDS.DATE] as string) || "",
        weight: toNumber(record.fields[FOLLOWUP_FIELDS.WEIGHT]),
        bodyFat: toNumber(record.fields[FOLLOWUP_FIELDS.BODY_FAT]),
        waist: toNumber(record.fields[FOLLOWUP_FIELDS.WAIST]),
        chest: toNumber(record.fields[FOLLOWUP_FIELDS.CHEST]),
        arm: toNumber(record.fields[FOLLOWUP_FIELDS.ARM]),
        thigh: toNumber(record.fields[FOLLOWUP_FIELDS.THIGH]),
        trainerNotes: (record.fields[FOLLOWUP_FIELDS.TRAINER_NOTES] as string) || "",
        memberNotes: (record.fields[FOLLOWUP_FIELDS.MEMBER_NOTES] as string) || "",
      },
    });
  } catch (error) {
    console.error("Followup update error:", error);
    return NextResponse.json(
      { message: "Failed to update followup" },
      { status: 500 }
    );
  }
}

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

    const owns = await assertOwnership(id, user.recordId);
    if (!owns) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (await isPlanManagedByTrainer(user.recordId)) {
      return NextResponse.json(
        { message: "مدربك يدير متابعتك حالياً ولا يمكنك حذف المتابعة" },
        { status: 403 }
      );
    }

    await deleteRecord(TABLES.FOLLOWUPS, id);
    await invalidateWorkoutsCache(user.recordId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Followup delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete followup" },
      { status: 500 }
    );
  }
}
