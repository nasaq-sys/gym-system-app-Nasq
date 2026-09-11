import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { trainerHealthSchema } from "@/lib/validations/trainerHealthSchema";
import { getRecordById, getRecords, getRecordsByIds, createRecord } from "@/lib/airtable";
import {
  TABLES,
  MEMBER_FIELDS,
  INBODY_FIELDS,
  WEIGHT_LOG_FIELDS,
  EXERCISE_FIELDS,
  MEAL_CALCULATOR_FIELDS,
  FOLLOWUP_FIELDS,
} from "@/lib/constants";
import { assertTrainerCanManageTrainee } from "@/lib/trainingSchedule";

// No `export const dynamic = "force-dynamic"` here on purpose: getSession()
// already reads cookies() (an inherently-dynamic API), so this route is
// still rendered fresh per request either way — but force-dynamic also
// forces every fetch in the segment to cache: "no-store", which would
// silently defeat the `revalidate: 300` on the exercise-library read below
// (a small, mostly-static reference table with no reason to hit Airtable
// live on every single page load).

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

function toNumber(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// نسبة الدهون on InBody Scans is a real Airtable "percent" field — the API
// returns it as a fraction (0.28 for 28%), unlike every other body-fat field
// in this app (FOLLOWUP_FIELDS.BODY_FAT etc.) which are plain text like
// "28.0". Confirmed against live records via the Airtable schema/data
// inspector before writing this — do not reuse toNumber() for it directly.
function toPercent(value: unknown): number | null {
  const n = toNumber(value);
  return n == null ? null : Math.round(n * 1000) / 10;
}

// Bounded, recent-first resolution of a reverse-link field on the member
// record (same pattern as admin's resolveRecent in
// /api/admin/members/[id]/route.ts) — cheap for InBody/weight logs since
// both have a reverse link array right on المتدربين, no full-table scan.
// Fetches every id in ONE batched Airtable request (getRecordsByIds) instead
// of one request per id — this used to fire up to 30 individual
// getRecordById calls in parallel for the weight-log section alone, which
// is exactly the kind of burst that trips Airtable's 5-req/s-per-base cap
// (shared across every user of the app) and made this tab feel like it hung.
async function resolveRecent<T>(
  tableName: string,
  ids: unknown,
  limit: number,
  map: (fields: Record<string, unknown>, id: string) => T
): Promise<T[]> {
  const linkedIds = Array.isArray(ids) ? (ids as string[]) : [];
  const recent = linkedIds.slice(-limit).reverse();
  if (recent.length === 0) return [];
  const records = await getRecordsByIds(tableName, recent);
  const byId = new Map(records.map((r) => [r.id, r]));
  return recent
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) => map(r.fields, r.id));
}

// GET — read-only health snapshot for one trainee: InBody scans, periodic
// follow-up history, recent weight-lifting logs, and recent meal-log
// entries. Everything here is view-only from the trainer's side except
// periodic follow-ups (POST below) — the trainer's own check-in data, not
// something the trainee logs themselves.
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

    const [member, mealRecords, followupRecords, exerciseRecords] = await Promise.all([
      getRecordById(TABLES.MEMBERS, id),
      getRecords(TABLES.MEAL_CALCULATOR),
      getRecords(TABLES.FOLLOWUPS),
      // Exercise library — small, mostly-static reference table (same one
      // /api/workouts/exercises uses) needed to resolve اسم التمرين on a
      // weight-log row, which is itself a *link* field, not text. Reading it
      // with scalar() alone (as this route used to) returns the linked
      // record's raw id ("recXXXX...") instead of a name.
      getRecords(TABLES.EXERCISES, { revalidate: 300, tags: ["exercises"] }),
    ]);
    const f = member.fields;

    const exerciseById = new Map(
      exerciseRecords.map((r) => [
        r.id,
        {
          name: scalar(r.fields[EXERCISE_FIELDS.NAME]),
          muscleGroup: scalar(r.fields[EXERCISE_FIELDS.MUSCLE_GROUP]),
        },
      ])
    );

    const [inbodyScans, rawWeightLogs] = await Promise.all([
      resolveRecent(TABLES.INBODY_SCANS, f[MEMBER_FIELDS.INBODY_SCANS], 5, (ff) => ({
        title: scalar(ff[INBODY_FIELDS.TITLE]),
        bodyFat: toPercent(ff[INBODY_FIELDS.BODY_FAT]),
        weight: toNumber(ff[INBODY_FIELDS.WEIGHT]),
        muscleMass: toNumber(ff[INBODY_FIELDS.MUSCLE_MASS]),
        goal: scalar(ff[INBODY_FIELDS.GOAL]),
      })),
      // Bounded to the 30 most-recently-linked weight-log records — enough
      // to build a real per-exercise history (grouped below), still a small
      // fixed-size burst of getRecordById calls rather than a full-table scan.
      resolveRecent(TABLES.WEIGHT_LOGS, f[MEMBER_FIELDS.WEIGHT_LOGS], 30, (ff) => {
        const exId = (ff[WEIGHT_LOG_FIELDS.EXERCISE] as string[] | undefined)?.[0];
        const ex = exId ? exerciseById.get(exId) : undefined;
        return {
          exerciseId: exId ?? "",
          exerciseName: ex?.name ?? "",
          muscleGroup: ex?.muscleGroup ?? "",
          weight: toNumber(ff[WEIGHT_LOG_FIELDS.WEIGHT]),
          reps: toNumber(ff[WEIGHT_LOG_FIELDS.REPS]),
          sets: toNumber(ff[WEIGHT_LOG_FIELDS.SETS]),
          date: scalar(ff[WEIGHT_LOG_FIELDS.DATE]),
          sessionNotes: scalar(ff[WEIGHT_LOG_FIELDS.SESSION_NOTES]),
        };
      }),
    ]);

    // Group the flat, newest-linked-first log list into one card per
    // exercise — mirrors /api/workouts/exercises (the member's own weight
    // log), which is exactly what the trainer view should look/behave like:
    // a "last logged" summary per exercise, full history underneath.
    const weightLogsByExercise = new Map<
      string,
      {
        exerciseId: string;
        exerciseName: string;
        muscleGroup: string;
        latest: {
          weight: number | null;
          reps: number | null;
          sets: number | null;
          date: string;
          sessionNotes: string;
        } | null;
        history: {
          weight: number | null;
          reps: number | null;
          sets: number | null;
          date: string;
          sessionNotes: string;
        }[];
      }
    >();
    for (const log of rawWeightLogs) {
      const key = log.exerciseId || log.exerciseName || "unknown";
      if (!weightLogsByExercise.has(key)) {
        weightLogsByExercise.set(key, {
          exerciseId: log.exerciseId,
          exerciseName: log.exerciseName,
          muscleGroup: log.muscleGroup,
          latest: null,
          history: [],
        });
      }
      const entry = weightLogsByExercise.get(key)!;
      const point = {
        weight: log.weight,
        reps: log.reps,
        sets: log.sets,
        date: log.date,
        sessionNotes: log.sessionNotes,
      };
      entry.history.push(point);
    }
    for (const entry of weightLogsByExercise.values()) {
      entry.history.sort((a, b) => b.date.localeCompare(a.date));
      entry.latest = entry.history[0] ?? null;
    }
    const weightLogs = Array.from(weightLogsByExercise.values()).sort((a, b) =>
      (b.latest?.date ?? "").localeCompare(a.latest?.date ?? "")
    );

    // Neither meal-log entries nor follow-ups have a reverse-link field on
    // المتدربين — same "scan the whole table, filter by linked id in JS"
    // pattern already used by /api/followups (member's own) and /api/meal-log.
    const mealLogs = mealRecords
      .filter((r) => {
        const rawMember = r.fields[MEAL_CALCULATOR_FIELDS.MEMBER];
        const links = Array.isArray(rawMember)
          ? (rawMember as string[])
          : rawMember
          ? [String(rawMember)]
          : [];
        return links.includes(id);
      })
      .map((r) => ({
        description: scalar(r.fields[MEAL_CALCULATOR_FIELDS.DESCRIPTION]),
        quantityGrams: toNumber(r.fields[MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS]),
        calories: toNumber(r.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CALORIES]),
        protein: toNumber(r.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_PROTEIN]),
        fat: toNumber(r.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_FAT]),
        carbs: toNumber(r.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CARBS]),
        date: scalar(r.fields[MEAL_CALCULATOR_FIELDS.DATE]) || r.createdTime?.slice(0, 10) || "",
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);

    const followups = followupRecords
      .filter((r) => {
        const links =
          (r.fields[FOLLOWUP_FIELDS.MEMBER] as string[] | undefined) ?? [];
        return links.includes(id);
      })
      .map((r) => ({
        id: r.id,
        number: r.fields[FOLLOWUP_FIELDS.NUMBER] as number | undefined,
        date: scalar(r.fields[FOLLOWUP_FIELDS.DATE]),
        weight: toNumber(r.fields[FOLLOWUP_FIELDS.WEIGHT]),
        bodyFat: toNumber(r.fields[FOLLOWUP_FIELDS.BODY_FAT]),
        waist: toNumber(r.fields[FOLLOWUP_FIELDS.WAIST]),
        chest: toNumber(r.fields[FOLLOWUP_FIELDS.CHEST]),
        arm: toNumber(r.fields[FOLLOWUP_FIELDS.ARM]),
        thigh: toNumber(r.fields[FOLLOWUP_FIELDS.THIGH]),
        trainerNotes: scalar(r.fields[FOLLOWUP_FIELDS.TRAINER_NOTES]),
        memberNotes: scalar(r.fields[FOLLOWUP_FIELDS.MEMBER_NOTES]),
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? 0) - (a.number ?? 0));

    return NextResponse.json({
      success: true,
      data: { inbodyScans, weightLogs, mealLogs, followups },
    });
  } catch (error) {
    console.error("Trainer trainee health fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch trainee health data" },
      { status: 500 }
    );
  }
}

// POST { type: "followup" | "inbody", ... } — the trainer logs either a new
// periodic follow-up (متابعة دورية, measurements + notes from an in-person
// check-in) or a new InBody scan for this trainee. These are the only two
// pieces of health data trainers author here — weight logs and meal entries
// stay read-only (the trainee's own day-to-day logging).
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

    // 2. Strict Input Validation via Zod
    const validation = trainerHealthSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid health data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const body = validation.data;

    if (body.type === "inbody") {
      const bodyFatPct = body.bodyFat != null ? parseFloat(body.bodyFat) : NaN;
      const weightNum = body.weight != null ? parseFloat(body.weight) : NaN;
      const muscleMassNum = body.muscleMass != null ? parseFloat(body.muscleMass) : NaN;

      const fields: Record<string, unknown> = {
        [INBODY_FIELDS.MEMBER_NAME]: [id],
      };
      if (Number.isFinite(bodyFatPct)) {
        fields[INBODY_FIELDS.BODY_FAT] = bodyFatPct / 100;
      }
      if (Number.isFinite(weightNum)) fields[INBODY_FIELDS.WEIGHT] = weightNum;
      if (Number.isFinite(muscleMassNum)) {
        fields[INBODY_FIELDS.MUSCLE_MASS] = muscleMassNum;
      }

      const record = await createRecord(TABLES.INBODY_SCANS, fields);
      return NextResponse.json({ success: true, data: { id: record.id } });
    }

    const today = new Date().toISOString().slice(0, 10);

    const record = await createRecord(TABLES.FOLLOWUPS, {
      [FOLLOWUP_FIELDS.MEMBER]: [id],
      [FOLLOWUP_FIELDS.DATE]: body.date || today,
      [FOLLOWUP_FIELDS.WEIGHT]: body.weight ?? "",
      [FOLLOWUP_FIELDS.BODY_FAT]: body.bodyFat ?? "",
      [FOLLOWUP_FIELDS.WAIST]: body.waist ?? "",
      [FOLLOWUP_FIELDS.CHEST]: body.chest ?? "",
      [FOLLOWUP_FIELDS.ARM]: body.arm ?? "",
      [FOLLOWUP_FIELDS.THIGH]: body.thigh ?? "",
      [FOLLOWUP_FIELDS.TRAINER_NOTES]: body.trainerNotes ?? "",
    });

    return NextResponse.json({ success: true, data: { id: record.id } });
  } catch (error) {
    console.error("Trainer health-entry create error:", error);
    return NextResponse.json(
      { message: "Failed to create entry" },
      { status: 500 }
    );
  }
}

