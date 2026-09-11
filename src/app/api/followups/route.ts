import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, getRecordById, createRecord } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS, FOLLOWUP_FIELDS } from "@/lib/constants";
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

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET — the logged-in member's own periodic follow-up history + managedByTrainer flag.
export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [records, member] = await Promise.all([
      getRecords(TABLES.FOLLOWUPS),
      getRecordById(TABLES.MEMBERS, user.recordId).catch(() => null),
    ]);

    const managedByTrainer = Boolean(
      member?.fields?.[MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]
    );

    const items = records
      .filter((r) => {
        const memberIds =
          (r.fields[FOLLOWUP_FIELDS.MEMBER] as string[] | undefined) || [];
        return memberIds.includes(user.recordId);
      })
      .map((r) => ({
        id: r.id,
        number: r.fields[FOLLOWUP_FIELDS.NUMBER] as number | undefined,
        date: (r.fields[FOLLOWUP_FIELDS.DATE] as string) || "",
        weight: toNumber(r.fields[FOLLOWUP_FIELDS.WEIGHT]),
        bodyFat: toNumber(r.fields[FOLLOWUP_FIELDS.BODY_FAT]),
        waist: toNumber(r.fields[FOLLOWUP_FIELDS.WAIST]),
        chest: toNumber(r.fields[FOLLOWUP_FIELDS.CHEST]),
        arm: toNumber(r.fields[FOLLOWUP_FIELDS.ARM]),
        thigh: toNumber(r.fields[FOLLOWUP_FIELDS.THIGH]),
        trainerNotes:
          (r.fields[FOLLOWUP_FIELDS.TRAINER_NOTES] as string) || "",
        memberNotes: (r.fields[FOLLOWUP_FIELDS.MEMBER_NOTES] as string) || "",
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? 0) - (a.number ?? 0));

    return NextResponse.json({
      success: true,
      data: { items, managedByTrainer },
    });
  } catch (error) {
    console.error("Followups fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch followups" },
      { status: 500 }
    );
  }
}

// POST — member adds a new follow-up (measurements & notes)
export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Check if the trainer manages this trainee's plan / follow-ups
    if (await isPlanManagedByTrainer(user.recordId)) {
      return NextResponse.json(
        { message: "مدربك يدير متابعتك حالياً ولا يمكنك إضافة أو تعديل القياسات" },
        { status: 403 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const validation = followupSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "validation_failed",
          message: validation.error.issues[0]?.message || "Invalid followup data",
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    const date = data.date || todayStr();

    const record = await createRecord(TABLES.FOLLOWUPS, {
      [FOLLOWUP_FIELDS.MEMBER]: [user.recordId],
      [FOLLOWUP_FIELDS.DATE]: date,
      [FOLLOWUP_FIELDS.WEIGHT]: data.weight != null && data.weight !== "" ? String(data.weight) : "",
      [FOLLOWUP_FIELDS.BODY_FAT]: data.bodyFat != null && data.bodyFat !== "" ? String(data.bodyFat) : "",
      [FOLLOWUP_FIELDS.WAIST]: data.waist != null && data.waist !== "" ? String(data.waist) : "",
      [FOLLOWUP_FIELDS.CHEST]: data.chest != null && data.chest !== "" ? String(data.chest) : "",
      [FOLLOWUP_FIELDS.ARM]: data.arm != null && data.arm !== "" ? String(data.arm) : "",
      [FOLLOWUP_FIELDS.THIGH]: data.thigh != null && data.thigh !== "" ? String(data.thigh) : "",
      [FOLLOWUP_FIELDS.MEMBER_NOTES]: data.memberNotes || "",
    });

    await invalidateWorkoutsCache(user.recordId);

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        number: record.fields[FOLLOWUP_FIELDS.NUMBER] as number | undefined,
        date,
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
    console.error("Followup create error:", error);
    return NextResponse.json(
      { message: "Failed to create followup" },
      { status: 500 }
    );
  }
}
