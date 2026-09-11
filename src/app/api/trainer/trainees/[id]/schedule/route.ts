import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createWorkoutScheduleSchema } from "@/lib/validations/workoutScheduleSchema";
import {
  getRecordById,
  createRecord,
  createRecords,
  updateRecord,
  deleteRecords,
} from "@/lib/airtable";
import {
  TABLES,
  MEMBER_FIELDS,
  SCHEDULE_FIELDS,
  SCHEDULE_ITEM_FIELDS,
} from "@/lib/constants";
import {
  getAnchorDay,
  getMemberSchedules,
  assertTrainerCanManageTrainee,
  getScheduleItemIdsForPlan,
} from "@/lib/trainingSchedule";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
        { status: 403 }
      );
    }

    const [member, schedules, anchorDay] = await Promise.all([
      getRecordById(TABLES.MEMBERS, id),
      getMemberSchedules(id),
      getAnchorDay(id),
    ]);

    const nameRaw = member.fields[MEMBER_FIELDS.NAME];
    const memberName = Array.isArray(nameRaw) ? String(nameRaw[0] ?? "") : String(nameRaw ?? "");
    const managedByTrainer = Boolean(
      member.fields[MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]
    );

    return NextResponse.json({
      success: true,
      data: schedules,
      anchorDay,
      memberName,
      managedByTrainer,
    });
  } catch (error) {
    console.error("Trainer trainee schedule fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch trainee schedule" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
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

    // 2. Strict Input Validation & Anti-XSS Sanitization via Zod
    const validation = createWorkoutScheduleSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid schedule data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { planName, targetDay, items } = validation.data;
    const finalPlanName = planName || "خطة من المدرب";

    await updateRecord(TABLES.MEMBERS, id, {
      [MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]: true,
    });

    const existingSchedules = await getMemberSchedules(id);
    const existingPlan = existingSchedules.find((s) => s.targetDay === targetDay);

    let planId: string;
    if (existingPlan) {
      planId = existingPlan.id;
      await updateRecord(TABLES.TRAINING_SCHEDULES, planId, {
        [SCHEDULE_FIELDS.PLAN_NAME]: finalPlanName,
      });
      const oldItemIds = await getScheduleItemIdsForPlan(planId);
      if (oldItemIds.length > 0) {
        await deleteRecords(TABLES.SCHEDULE_ITEMS, oldItemIds);
      }
    } else {
      const plan = await createRecord(TABLES.TRAINING_SCHEDULES, {
        [SCHEDULE_FIELDS.PLAN_NAME]: finalPlanName,
        [SCHEDULE_FIELDS.TARGET_DAY]: targetDay,
        [SCHEDULE_FIELDS.MEMBER]: [id],
      });
      planId = plan.id;
    }

    // Clean up any other duplicate schedule records for the same day
    const duplicates = existingSchedules.filter(
      (s) => s.targetDay === targetDay && s.id !== planId
    );
    for (const dup of duplicates) {
      const dupItemIds = await getScheduleItemIdsForPlan(dup.id);
      if (dupItemIds.length > 0) {
        await deleteRecords(TABLES.SCHEDULE_ITEMS, dupItemIds);
      }
      await deleteRecords(TABLES.TRAINING_SCHEDULES, [dup.id]);
    }

    const { records: createdItems } = await createRecords(
      TABLES.SCHEDULE_ITEMS,
      items.map((it) => {
        const fields: Record<string, unknown> = {
          [SCHEDULE_ITEM_FIELDS.DESCRIPTION]: `${finalPlanName} — ${targetDay}`,
          [SCHEDULE_ITEM_FIELDS.PLAN]: [planId],
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

    await invalidateWorkoutsCache(id);

    return NextResponse.json({
      success: true,
      data: {
        id: planId,
        planName: finalPlanName,
        targetDay: targetDay,
        items: createdItems.map((it, i) => ({
          id: it.id,
          exerciseId: items[i].exerciseId,
          exerciseName: "",
          repsSets: items[i].repsSets || (items[i].sets && items[i].reps ? `${items[i].sets}×${items[i].reps}` : ""),
          reps: items[i].reps ?? null,
          sets: items[i].sets ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("Trainer schedule create error:", error);
    return NextResponse.json(
      { message: "Failed to create schedule" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, id))) {
      return NextResponse.json(
        { message: "This member is not one of your trainees" },
        { status: 403 }
      );
    }

    const { managedByTrainer } = (await request.json().catch(() => ({}))) as {
      managedByTrainer?: boolean;
    };

    if (typeof managedByTrainer !== "boolean") {
      return NextResponse.json(
        { message: "managedByTrainer (boolean) is required" },
        { status: 400 }
      );
    }

    await updateRecord(TABLES.MEMBERS, id, {
      [MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]: managedByTrainer,
    });

    await invalidateWorkoutsCache(id);

    return NextResponse.json({ success: true, data: { managedByTrainer } });
  } catch (error) {
    console.error("Trainer plan-management toggle error:", error);
    return NextResponse.json(
      { message: "Failed to update plan management" },
      { status: 500 }
    );
  }
}

