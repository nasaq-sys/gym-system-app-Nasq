import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { updateWorkoutScheduleSchema } from "@/lib/validations/workoutScheduleSchema";
import {
  getRecordById,
  getRecords,
  updateRecord,
  deleteRecord,
  deleteRecords,
  createRecords,
} from "@/lib/airtable";
import { TABLES, SCHEDULE_FIELDS, SCHEDULE_ITEM_FIELDS } from "@/lib/constants";
import { isPlanManagedByTrainer } from "@/lib/trainingSchedule";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

function legacyRepsSets(reps?: number, sets?: number): string {
  if (reps != null && sets != null) return `${reps}×${sets}`;
  if (reps != null) return `${reps}`;
  return "";
}

export const dynamic = "force-dynamic";

// Confirms the schedule record actually belongs to the signed-in member
// before allowing an edit/delete
async function assertOwnership(id: string, memberRecordId: string) {
  try {
    const record = await getRecordById(TABLES.TRAINING_SCHEDULES, id);
    if (!record) return false;
    const memberLinks = record.fields[SCHEDULE_FIELDS.MEMBER];
    const linkedIds = Array.isArray(memberLinks)
      ? (memberLinks as string[])
      : typeof memberLinks === "string"
        ? [memberLinks]
        : [];
    return linkedIds.includes(memberRecordId);
  } catch (err) {
    console.error("assertOwnership error:", err);
    return false;
  }
}

// Finds every بنود جدول التمارين row currently linked to this plan.
async function getItemIdsForPlan(planId: string): Promise<string[]> {
  const items = await getRecords(TABLES.SCHEDULE_ITEMS);
  return items
    .filter((item) => {
      const planLinks = item.fields[SCHEDULE_ITEM_FIELDS.PLAN];
      const planIds = Array.isArray(planLinks) ? (planLinks as string[]) : [];
      return planIds.includes(planId);
    })
    .map((item) => item.id);
}

export async function PATCH(
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

    const owns = await assertOwnership(id, user.recordId);
    if (!owns) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (await isPlanManagedByTrainer(user.recordId)) {
      return NextResponse.json(
        { message: "Your trainer manages this plan" },
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

    // 2. Strict Input Validation via Zod
    const validation = updateWorkoutScheduleSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid update data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const body = validation.data;

    const fields: Record<string, string> = {};
    if (body.planName !== undefined) fields[SCHEDULE_FIELDS.PLAN_NAME] = body.planName;
    if (body.targetDay !== undefined) fields[SCHEDULE_FIELDS.TARGET_DAY] = body.targetDay;

    let record = await getRecordById(TABLES.TRAINING_SCHEDULES, id);
    if (Object.keys(fields).length > 0) {
      record = await updateRecord(TABLES.TRAINING_SCHEDULES, id, fields);
    }

    let items: {
      id: string;
      exerciseId: string;
      exerciseName: string;
      repsSets: string;
      reps: number | null;
      sets: number | null;
    }[] = [];
    if (body.items) {
      const oldItemIds = await getItemIdsForPlan(id);
      if (oldItemIds.length > 0) await deleteRecords(TABLES.SCHEDULE_ITEMS, oldItemIds);

      const planName = (record.fields[SCHEDULE_FIELDS.PLAN_NAME] as string) || "خطة مخصصة";
      const targetDay = (record.fields[SCHEDULE_FIELDS.TARGET_DAY] as string) || "";
      if (body.items.length > 0) {
        const { records: created } = await createRecords(
          TABLES.SCHEDULE_ITEMS,
          body.items.map((it) => ({
            fields: {
              [SCHEDULE_ITEM_FIELDS.DESCRIPTION]: `${planName} — ${targetDay}`,
              [SCHEDULE_ITEM_FIELDS.PLAN]: [id],
              [SCHEDULE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
              [SCHEDULE_ITEM_FIELDS.REPS_SETS]: it.repsSets || legacyRepsSets(it.reps, it.sets),
              ...(it.reps != null ? { [SCHEDULE_ITEM_FIELDS.REPS]: it.reps } : {}),
              ...(it.sets != null ? { [SCHEDULE_ITEM_FIELDS.SETS]: it.sets } : {}),
            },
          }))
        );
        items = created.map((rec, i) => ({
          id: rec.id,
          exerciseId: body.items![i].exerciseId,
          exerciseName: "",
          repsSets: body.items![i].repsSets || legacyRepsSets(body.items![i].reps, body.items![i].sets),
          reps: body.items![i].reps ?? null,
          sets: body.items![i].sets ?? null,
        }));
      }
    }

    await invalidateWorkoutsCache(user.recordId);

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        planName: (record.fields[SCHEDULE_FIELDS.PLAN_NAME] as string) || "",
        targetDay: (record.fields[SCHEDULE_FIELDS.TARGET_DAY] as string) || "",
        items,
      },
    });
  } catch (error) {
    console.error("Schedule update error:", error);
    return NextResponse.json(
      { message: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

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

    const owns = await assertOwnership(id, user.recordId);
    if (!owns) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (await isPlanManagedByTrainer(user.recordId)) {
      return NextResponse.json(
        { message: "Your trainer manages this plan" },
        { status: 403 }
      );
    }

    const itemIds = await getItemIdsForPlan(id);
    if (itemIds.length > 0) await deleteRecords(TABLES.SCHEDULE_ITEMS, itemIds);

    await deleteRecord(TABLES.TRAINING_SCHEDULES, id);
    await invalidateWorkoutsCache(user.recordId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Schedule delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

