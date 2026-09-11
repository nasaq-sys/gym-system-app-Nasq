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
import { TABLES, MEMBER_FIELDS, SCHEDULE_FIELDS, SCHEDULE_ITEM_FIELDS } from "@/lib/constants";
import { assertTrainerCanManageTrainee } from "@/lib/trainingSchedule";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

// Confirms the plan being edited/deleted actually belongs to *this* trainee
async function assertScheduleBelongsToTrainee(
  scheduleId: string,
  traineeId: string
): Promise<boolean> {
  const record = await getRecordById(TABLES.TRAINING_SCHEDULES, scheduleId);
  const memberLinks =
    (record.fields[SCHEDULE_FIELDS.MEMBER] as string[] | undefined) ?? [];
  return memberLinks.includes(traineeId);
}

// Finds every بنود جدول التمارين row currently linked to this plan
async function getItemIdsForPlan(planId: string): Promise<string[]> {
  const items = await getRecords(TABLES.SCHEDULE_ITEMS);
  return items
    .filter((item) => {
      const planIds =
        (item.fields[SCHEDULE_ITEM_FIELDS.PLAN] as string[] | undefined) ?? [];
      return planIds.includes(planId);
    })
    .map((item) => item.id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, scheduleId } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
        { status: 403 }
      );
    }
    if (!(await assertScheduleBelongsToTrainee(scheduleId, id))) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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

    await updateRecord(TABLES.MEMBERS, id, {
      [MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]: true,
    });

    const fields: Record<string, string> = {};
    if (body.planName !== undefined) fields[SCHEDULE_FIELDS.PLAN_NAME] = body.planName;
    if (body.targetDay !== undefined) fields[SCHEDULE_FIELDS.TARGET_DAY] = body.targetDay;

    let record = await getRecordById(TABLES.TRAINING_SCHEDULES, scheduleId);
    if (Object.keys(fields).length > 0) {
      record = await updateRecord(TABLES.TRAINING_SCHEDULES, scheduleId, fields);
    }

    let items: { id: string; exerciseId: string; exerciseName: string; repsSets: string }[] = [];
    if (body.items) {
      const oldItemIds = await getItemIdsForPlan(scheduleId);
      if (oldItemIds.length > 0) await deleteRecords(TABLES.SCHEDULE_ITEMS, oldItemIds);

      const planName = (record.fields[SCHEDULE_FIELDS.PLAN_NAME] as string) || "خطة من المدرب";
      const targetDay = (record.fields[SCHEDULE_FIELDS.TARGET_DAY] as string) || "";
      if (body.items.length > 0) {
        const { records: created } = await createRecords(
          TABLES.SCHEDULE_ITEMS,
          body.items.map((it) => {
            const fields: Record<string, unknown> = {
              [SCHEDULE_ITEM_FIELDS.DESCRIPTION]: `${planName} — ${targetDay}`,
              [SCHEDULE_ITEM_FIELDS.PLAN]: [scheduleId],
              [SCHEDULE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
              [SCHEDULE_ITEM_FIELDS.REPS_SETS]: it.repsSets || (it.sets && it.reps ? `${it.sets}×${it.reps}` : ""),
            };
            if (typeof it.reps === "number" && Number.isFinite(it.reps)) {
              fields[SCHEDULE_ITEM_FIELDS.REPS] = it.reps;
            }
            if (typeof it.sets === "number" && Number.isFinite(it.sets)) {
              fields[SCHEDULE_ITEM_FIELDS.SETS] = it.sets;
            }
            return { fields };
          })
        );
        items = created.map((rec, i) => ({
          id: rec.id,
          exerciseId: body.items![i].exerciseId,
          exerciseName: "",
          repsSets: body.items![i].repsSets || (body.items![i].sets && body.items![i].reps ? `${body.items![i].sets}×${body.items![i].reps}` : ""),
        }));
      }
    }

    await invalidateWorkoutsCache(id);

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
    console.error("Trainer schedule update error:", error);
    return NextResponse.json(
      { message: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, scheduleId } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
        { status: 403 }
      );
    }
    if (!(await assertScheduleBelongsToTrainee(scheduleId, id))) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await updateRecord(TABLES.MEMBERS, id, {
      [MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]: true,
    });

    const itemIds = await getItemIdsForPlan(scheduleId);
    if (itemIds.length > 0) await deleteRecords(TABLES.SCHEDULE_ITEMS, itemIds);

    await deleteRecord(TABLES.TRAINING_SCHEDULES, scheduleId);
    await invalidateWorkoutsCache(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trainer schedule delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

