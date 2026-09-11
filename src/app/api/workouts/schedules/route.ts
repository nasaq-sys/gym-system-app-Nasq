import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createWorkoutScheduleSchema } from "@/lib/validations/workoutScheduleSchema";
import {
  createRecord,
  createRecords,
  getRecordById,
  updateRecord,
  deleteRecords,
} from "@/lib/airtable";
import {
  TABLES,
  SCHEDULE_FIELDS,
  SCHEDULE_ITEM_FIELDS,
  MEMBER_FIELDS,
} from "@/lib/constants";
import {
  getAnchorDay,
  getMemberSchedules,
  isPlanManagedByTrainer,
  getScheduleItemIdsForPlan,
} from "@/lib/trainingSchedule";
import { withCacheSWR, invalidateWorkoutsCache, REDIS_KEYS } from "@/lib/cacheService";

// Builds the legacy combined display string from the new separate fields so
// anything still reading التكرارات والمجموعات (e.g. the trainer console)
// keeps showing something sensible, even though it's no longer the source
// of truth.
function legacyRepsSets(reps?: number, sets?: number): string {
  if (reps != null && sets != null) return `${reps}×${sets}`;
  if (reps != null) return `${reps}`;
  return "";
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = REDIS_KEYS.MEMBER_WORKOUTS(user.recordId);

  try {
    const cacheResult = await withCacheSWR(
      cacheKey,
      async () => {
        const [schedules, anchorDay, member] = await Promise.all([
          getMemberSchedules(user.recordId),
          getAnchorDay(user.recordId),
          getRecordById(TABLES.MEMBERS, user.recordId),
        ]);

        // When the trainer has taken over this member's plan, the member's own
        // page is read-only
        const managedByTrainer = Boolean(
          member?.fields?.[MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]
        );

        return {
          schedules,
          anchorDay,
          managedByTrainer,
        };
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 1800, // 30 minutes soft TTL
        logTag: `workouts:schedules:${user.recordId}`,
      }
    );

    return NextResponse.json({
      success: true,
      data: cacheResult.data.schedules,
      anchorDay: cacheResult.data.anchorDay,
      managedByTrainer: cacheResult.data.managedByTrainer,
    });
  } catch (error) {
    console.error("Schedules fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch schedules" },
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
    const finalPlanName = planName || "خطة مخصصة";

    const existingSchedules = await getMemberSchedules(user.recordId);
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
        [SCHEDULE_FIELDS.MEMBER]: [user.recordId],
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
      items.map((it) => ({
        fields: {
          [SCHEDULE_ITEM_FIELDS.DESCRIPTION]: `${finalPlanName} — ${targetDay}`,
          [SCHEDULE_ITEM_FIELDS.PLAN]: [planId],
          [SCHEDULE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
          [SCHEDULE_ITEM_FIELDS.REPS_SETS]: it.repsSets || legacyRepsSets(it.reps, it.sets),
          ...(it.reps != null ? { [SCHEDULE_ITEM_FIELDS.REPS]: it.reps } : {}),
          ...(it.sets != null ? { [SCHEDULE_ITEM_FIELDS.SETS]: it.sets } : {}),
        },
      }))
    );

    await invalidateWorkoutsCache(user.recordId);

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
          repsSets: items[i].repsSets || legacyRepsSets(items[i].reps, items[i].sets),
          reps: items[i].reps ?? null,
          sets: items[i].sets ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("Schedule create error:", error);
    return NextResponse.json(
      { message: "Failed to create schedule" },
      { status: 500 }
    );
  }
}


