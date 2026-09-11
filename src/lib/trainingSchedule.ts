import {
  getRecords,
  getRecordById,
  createRecord,
  createRecords,
  updateRecord,
  deleteRecords,
} from "@/lib/airtable";
import {
  TABLES,
  SCHEDULE_FIELDS,
  SCHEDULE_ITEM_FIELDS,
  SUBSCRIPTION_FIELDS,
  EXERCISE_FIELDS,
  TRAINER_FIELDS,
  MEMBER_FIELDS,
  PLAN_TEMPLATE_FIELDS,
  PLAN_TEMPLATE_ITEM_FIELDS,
} from "@/lib/constants";
import { invalidateWorkoutsCache } from "@/lib/cacheService";

// Shared by every trainer-scoped schedule route (view + create + edit +
// delete) — confirms the trainee is actually linked to this trainer before
// letting them read or touch that member's schedule.
export async function assertTrainerOwnsTrainee(
  trainerRecordId: string,
  traineeId: string
): Promise<boolean> {
  const trainer = await getRecordById(TABLES.TRAINERS, trainerRecordId);
  const linkedIds =
    (trainer.fields[TRAINER_FIELDS.MEMBERS] as string[] | undefined) ?? [];
  return linkedIds.includes(traineeId);
}

// Looser gate used by the trainee schedule/apply-template routes: a trainer
// can manage a trainee's plan either because the trainee is formally on
// their roster (assertTrainerOwnsTrainee), OR because the trainee has no
// trainer assigned at all yet — no "claim to my list" step required just to
// go in and build/edit someone's plan. A trainee already assigned to a
// *different* trainer still isn't accessible here.
export async function assertTrainerCanManageTrainee(
  trainerRecordId: string,
  traineeId: string
): Promise<boolean> {
  if (await assertTrainerOwnsTrainee(trainerRecordId, traineeId)) return true;
  const member = await getRecordById(TABLES.MEMBERS, traineeId);
  const links = member.fields[MEMBER_FIELDS.TRAINER];
  return !Array.isArray(links) || links.length === 0;
}

// Server-side gate for the member's own POST/PATCH/DELETE schedule routes —
// once a trainer has taken over a member's plan (PLAN_MANAGED_BY_TRAINER),
// the member can't mutate it themselves even by calling the API directly;
// hiding the buttons client-side alone isn't enough.
export async function isPlanManagedByTrainer(
  memberRecordId: string
): Promise<boolean> {
  const member = await getRecordById(TABLES.MEMBERS, memberRecordId);
  return Boolean(member.fields[MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]);
}

export interface ScheduleItemView {
  id: string;
  exerciseId: string;
  exerciseName: string;
  repsSets: string;
  reps: number | null;
  sets: number | null;
}

// Old رows only have the combined free-text field (e.g. "10×3", "10x3").
// Best-effort split so they still show *something* in the new reps/sets UI
// until the member/trainer re-saves them through the new fields. Assumes
// "reps×sets" order, matching how the field was labeled in the UI.
function parseLegacyRepsSets(raw: string): { reps: number | null; sets: number | null } {
  const match = raw.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  if (match) {
    return { reps: Number(match[1]), sets: Number(match[2]) };
  }
  const single = raw.match(/\d+/);
  return { reps: single ? Number(single[0]) : null, sets: null };
}

export interface ScheduleView {
  id: string;
  planName: string;
  targetDay: string;
  items: ScheduleItemView[];
}

// Shared by the member's own /api/workouts/schedules route and the trainer
// console (which needs to read a trainee's schedule, not just the logged-in
// member's own) — kept in one place so both stay in sync instead of two
// copies of the same junction-table-resolution logic drifting apart.

// "Day 1" anchors to whichever weekday the member's most recent subscription
// started on (so if someone joined/renewed on a Wednesday, Wednesday becomes
// their personal Day 1). Falls back to Sunday (0) with no subscription history.
export async function getAnchorDay(memberRecordId: string): Promise<number> {
  try {
    const subs = await getRecords(TABLES.SUBSCRIPTIONS, {
      revalidate: 300,
      tags: [`subscriptions-${memberRecordId}`],
    });

    const memberSubs = subs.filter((r) => {
      const links = r.fields[SUBSCRIPTION_FIELDS.MEMBER_LINK];
      const linkedIds = Array.isArray(links) ? (links as string[]) : [];
      return linkedIds.includes(memberRecordId);
    });

    if (memberSubs.length === 0) return 0;

    let latestDate: Date | null = null;
    for (const sub of memberSubs) {
      const raw = sub.fields[SUBSCRIPTION_FIELDS.START_DATE] as string | undefined;
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      if (!latestDate || d.getTime() > latestDate.getTime()) latestDate = d;
    }

    return latestDate ? latestDate.getUTCDay() : 0;
  } catch (error) {
    console.error("Anchor day lookup failed:", error);
    return 0;
  }
}

// The Airtable singleSelect only stores these 7 fixed Arabic labels — order
// matters here since "vacation" below just steps forward through this list.
export const WORKOUT_DAY_LABELS_AR = [
  "اليوم الاول",
  "اليوم الثاني",
  "اليوم الثالث",
  "اليوم الرابع",
  "اليوم الخامس",
  "اليوم السادس",
  "اليوم السابع",
];

// Re-labels the vacated day's schedule(s) to the next day's slot. If that
// next day already has its own plan, THAT plan cascades forward one day
// too, and so on — otherwise two plans would collide on the same day. The
// cascade stops at the first day that currently has no plan (it just
// absorbs whatever lands on it), or wraps all the way back around to the
// vacated day itself if every single day was full. Every move is based on
// one up-front snapshot, so it's still one write per existing plan, not a
// blind rewrite of the whole week.
export async function moveScheduleToNextDay(
  memberRecordId: string,
  day: string
): Promise<{ movedCount: number; nextDay: string; daysShifted: number } | null> {
  const idx = WORKOUT_DAY_LABELS_AR.indexOf(day);
  if (idx === -1) return null;

  const records = await getRecords(TABLES.TRAINING_SCHEDULES);
  const memberRecords = records.filter((r) => {
    const links = r.fields[SCHEDULE_FIELDS.MEMBER];
    const linkedIds = Array.isArray(links) ? (links as string[]) : [];
    return linkedIds.includes(memberRecordId);
  });

  const byDayIndex = new Map<number, typeof memberRecords>();
  for (const r of memberRecords) {
    const di = WORKOUT_DAY_LABELS_AR.indexOf(
      (r.fields[SCHEDULE_FIELDS.TARGET_DAY] as string) || ""
    );
    if (di === -1) continue;
    const list = byDayIndex.get(di) ?? [];
    list.push(r);
    byDayIndex.set(di, list);
  }

  const nextDay = WORKOUT_DAY_LABELS_AR[(idx + 1) % 7];
  if (!byDayIndex.has(idx)) {
    // Nothing scheduled on the vacated day — nothing to cascade.
    return { movedCount: 0, nextDay, daysShifted: 0 };
  }

  // Walk forward from the day right after the vacated one, looking for the
  // first free slot. If the whole week is full, this wraps all the way
  // back to `idx` (now empty, since its own plan is the one moving out).
  let emptyIdx = (idx + 1) % 7;
  let guard = 0;
  while (byDayIndex.has(emptyIdx) && guard < 7) {
    emptyIdx = (emptyIdx + 1) % 7;
    guard++;
  }

  // Every day from the vacated one up to (not including) the first free
  // slot needs its plan bumped one day forward.
  const chain: number[] = [];
  for (let d = idx; d !== emptyIdx; d = (d + 1) % 7) {
    chain.push(d);
  }

  let movedCount = 0;
  await Promise.all(
    chain.flatMap((sourceIdx) => {
      const targetLabel = WORKOUT_DAY_LABELS_AR[(sourceIdx + 1) % 7];
      const recs = byDayIndex.get(sourceIdx) ?? [];
      movedCount += recs.length;
      return recs.map((r) =>
        updateRecord(TABLES.TRAINING_SCHEDULES, r.id, {
          [SCHEDULE_FIELDS.TARGET_DAY]: targetLabel,
        })
      );
    })
  );

  return { movedCount, nextDay, daysShifted: chain.length };
}

export async function getMemberSchedules(
  memberRecordId: string
): Promise<ScheduleView[]> {
  const [records, itemRecords, exerciseRecords] = await Promise.all([
    getRecords(TABLES.TRAINING_SCHEDULES),
    getRecords(TABLES.SCHEDULE_ITEMS),
    getRecords(TABLES.EXERCISES, { revalidate: 300, tags: ["exercises"] }),
  ]);

  const exerciseNameById = new Map(
    exerciseRecords.map((r) => [r.id, (r.fields[EXERCISE_FIELDS.NAME] as string) || ""])
  );

  const memberSchedules = records.filter((r) => {
    const memberLinks = r.fields[SCHEDULE_FIELDS.MEMBER];
    const linkedIds = Array.isArray(memberLinks) ? (memberLinks as string[]) : [];
    return linkedIds.includes(memberRecordId);
  });
  const memberScheduleIds = new Set(memberSchedules.map((r) => r.id));

  const itemsByPlan = new Map<string, ScheduleItemView[]>();
  for (const item of itemRecords) {
    const planLinks = item.fields[SCHEDULE_ITEM_FIELDS.PLAN];
    const planIds = Array.isArray(planLinks) ? (planLinks as string[]) : [];
    const planId = planIds[0];
    if (!planId || !memberScheduleIds.has(planId)) continue;

    const exerciseLinks = item.fields[SCHEDULE_ITEM_FIELDS.EXERCISE];
    const exerciseIds = Array.isArray(exerciseLinks) ? (exerciseLinks as string[]) : [];
    const exerciseId = exerciseIds[0];
    if (!exerciseId) continue;

    const repsSets = (item.fields[SCHEDULE_ITEM_FIELDS.REPS_SETS] as string) || "";
    const repsRaw = item.fields[SCHEDULE_ITEM_FIELDS.REPS];
    const setsRaw = item.fields[SCHEDULE_ITEM_FIELDS.SETS];
    // Prefer the real numeric fields; fall back to parsing the legacy
    // combined text for rows saved before this split existed.
    const hasNumericFields = repsRaw != null || setsRaw != null;
    const legacy = hasNumericFields ? null : parseLegacyRepsSets(repsSets);
    const list = itemsByPlan.get(planId) ?? [];
    list.push({
      id: item.id,
      exerciseId,
      exerciseName: exerciseNameById.get(exerciseId) || "",
      repsSets,
      reps: hasNumericFields ? (repsRaw != null ? Number(repsRaw) : null) : legacy!.reps,
      sets: hasNumericFields ? (setsRaw != null ? Number(setsRaw) : null) : legacy!.sets,
    });
    itemsByPlan.set(planId, list);
  }

  return memberSchedules.map((r) => ({
    id: r.id,
    planName: r.fields[SCHEDULE_FIELDS.PLAN_NAME] as string,
    targetDay: (r.fields[SCHEDULE_FIELDS.TARGET_DAY] as string) || "",
    items: itemsByPlan.get(r.id) ?? [],
  }));
}

// ── Ready-made plan templates (قوالب خطط التمارين) ──
// A reusable 7-day program a trainer builds once and applies to any trainee,
// instead of hand-picking exercises from scratch every time. Not linked to
// any member — day-by-day exercise data lives in بنود قالب التمارين, matched
// back to its template via PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE.

export interface TemplateItemView {
  id: string;
  day: string; // one of DAY_KEYS[].ar
  exerciseId: string;
  exerciseName: string;
  repsSets: string;
}

export interface TemplateView {
  id: string;
  name: string;
  description: string;
  items: TemplateItemView[];
}

export async function getPlanTemplates(): Promise<TemplateView[]> {
  const [templates, items, exercises] = await Promise.all([
    getRecords(TABLES.PLAN_TEMPLATES),
    getRecords(TABLES.PLAN_TEMPLATE_ITEMS),
    getRecords(TABLES.EXERCISES, { revalidate: 300, tags: ["exercises"] }),
  ]);

  const exerciseNameById = new Map(
    exercises.map((r) => [r.id, (r.fields[EXERCISE_FIELDS.NAME] as string) || ""])
  );

  const itemsByTemplate = new Map<string, TemplateItemView[]>();
  for (const item of items) {
    const templateLinks = item.fields[PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE];
    const templateIds = Array.isArray(templateLinks) ? (templateLinks as string[]) : [];
    const templateId = templateIds[0];
    if (!templateId) continue;

    const exerciseLinks = item.fields[PLAN_TEMPLATE_ITEM_FIELDS.EXERCISE];
    const exerciseIds = Array.isArray(exerciseLinks) ? (exerciseLinks as string[]) : [];
    const exerciseId = exerciseIds[0];
    if (!exerciseId) continue;

    const list = itemsByTemplate.get(templateId) ?? [];
    list.push({
      id: item.id,
      day: (item.fields[PLAN_TEMPLATE_ITEM_FIELDS.DAY] as string) || "",
      exerciseId,
      exerciseName: exerciseNameById.get(exerciseId) || "",
      repsSets: (item.fields[PLAN_TEMPLATE_ITEM_FIELDS.REPS_SETS] as string) || "",
    });
    itemsByTemplate.set(templateId, list);
  }

  return templates.map((r) => ({
    id: r.id,
    name: (r.fields[PLAN_TEMPLATE_FIELDS.NAME] as string) || "",
    description: (r.fields[PLAN_TEMPLATE_FIELDS.DESCRIPTION] as string) || "",
    items: itemsByTemplate.get(r.id) ?? [],
  }));
}

export async function getScheduleItemIdsForPlan(planId: string): Promise<string[]> {
  const items = await getRecords(TABLES.SCHEDULE_ITEMS);
  return items
    .filter((item) => {
      const planLinks = item.fields[SCHEDULE_ITEM_FIELDS.PLAN];
      const planIds = Array.isArray(planLinks) ? (planLinks as string[]) : [];
      return planIds.includes(planId);
    })
    .map((item) => item.id);
}

// Copies a template's per-day items into a trainee's real جداول التمارين —
// for each day the template defines, replaces that day's plan wholesale
// (reusing the existing plan record if the trainee already has one for that
// day, otherwise creating one) and hands plan management to the trainer.
// Days the template has no items for are left untouched, so applying a
// template never wipes out unrelated days the trainer built by hand.
export async function applyTemplateToTrainee(
  templateId: string,
  traineeId: string
): Promise<void> {
  const templates = await getPlanTemplates();
  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error("Template not found");
  }

  const itemsByDay = new Map<string, TemplateItemView[]>();
  for (const item of template.items) {
    if (!item.day) continue;
    const list = itemsByDay.get(item.day) ?? [];
    list.push(item);
    itemsByDay.set(item.day, list);
  }
  if (itemsByDay.size === 0) return;

  await updateRecord(TABLES.MEMBERS, traineeId, {
    [MEMBER_FIELDS.PLAN_MANAGED_BY_TRAINER]: true,
  });

  const existingSchedules = await getMemberSchedules(traineeId);
  const scheduleByDay = new Map(existingSchedules.map((s) => [s.targetDay, s]));

  for (const [day, items] of itemsByDay) {
    const existing = scheduleByDay.get(day);
    let planId: string;
    if (existing) {
      planId = existing.id;
      await updateRecord(TABLES.TRAINING_SCHEDULES, planId, {
        [SCHEDULE_FIELDS.PLAN_NAME]: template.name,
      });
      const oldItemIds = await getScheduleItemIdsForPlan(planId);
      if (oldItemIds.length > 0) await deleteRecords(TABLES.SCHEDULE_ITEMS, oldItemIds);
    } else {
      const plan = await createRecord(TABLES.TRAINING_SCHEDULES, {
        [SCHEDULE_FIELDS.PLAN_NAME]: template.name,
        [SCHEDULE_FIELDS.TARGET_DAY]: day,
        [SCHEDULE_FIELDS.MEMBER]: [traineeId],
      });
      planId = plan.id;
    }

    // Clean up any other duplicate records for this day to prevent stacking
    const duplicates = existingSchedules.filter((s) => s.targetDay === day && s.id !== planId);
    for (const dup of duplicates) {
      const dupItemIds = await getScheduleItemIdsForPlan(dup.id);
      if (dupItemIds.length > 0) {
        await deleteRecords(TABLES.SCHEDULE_ITEMS, dupItemIds);
      }
      await deleteRecords(TABLES.TRAINING_SCHEDULES, [dup.id]);
    }

    await createRecords(
      TABLES.SCHEDULE_ITEMS,
      items.map((it) => ({
        fields: {
          [SCHEDULE_ITEM_FIELDS.DESCRIPTION]: `${template.name} — ${day}`,
          [SCHEDULE_ITEM_FIELDS.PLAN]: [planId],
          [SCHEDULE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
          [SCHEDULE_ITEM_FIELDS.REPS_SETS]: it.repsSets || "",
        },
      }))
    );
  }

  await invalidateWorkoutsCache(traineeId);
}
