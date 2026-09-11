import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, getRecordsByFilter } from "@/lib/airtable";
import {
  TABLES,
  EXERCISE_FIELDS,
  WEIGHT_LOG_FIELDS,
} from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = REDIS_KEYS.MEMBER_EXERCISES(user.recordId);

  try {
    const cacheResult = await withCacheSWR(
      cacheKey,
      async () => {
        // Fetch static exercises catalog + targeted member weight logs using filterByFormula
        const [exercises, memberLogs] = await Promise.all([
          getRecords(TABLES.EXERCISES, { revalidate: 300, tags: ["exercises"] }),
          getRecordsByFilter(
            TABLES.WEIGHT_LOGS,
            `FIND('${user.recordId}', ARRAYJOIN({${WEIGHT_LOG_FIELDS.MEMBER}})) > 0`,
            {
              sort: [{ field: WEIGHT_LOG_FIELDS.DATE, direction: "desc" }],
              maxRecords: 100,
              revalidate: 45,
              tags: [`weight-logs-${user.recordId}`],
            }
          ).catch(() => []),
        ]);

        const latestByExercise: Record<
          string,
          {
            weight: number;
            reps: number;
            sets: number;
            date: string;
            sessionNotes: string;
          }
        > = {};
        const historyByExercise: Record<
          string,
          { weight: number; reps: number; sets: number; date: string }[]
        > = {};

        for (const log of memberLogs) {
          const exLinks = log.fields[WEIGHT_LOG_FIELDS.EXERCISE] as string[];
          const exId = exLinks?.[0];
          if (!exId) continue;

          const entry = {
            weight: (log.fields[WEIGHT_LOG_FIELDS.WEIGHT] as number) ?? 0,
            reps: (log.fields[WEIGHT_LOG_FIELDS.REPS] as number) ?? 0,
            sets: (log.fields[WEIGHT_LOG_FIELDS.SETS] as number) ?? 0,
            date: (log.fields[WEIGHT_LOG_FIELDS.DATE] as string) ?? "",
            sessionNotes:
              (log.fields[WEIGHT_LOG_FIELDS.SESSION_NOTES] as string) ?? "",
          };

          if (!historyByExercise[exId]) historyByExercise[exId] = [];
          historyByExercise[exId].push(entry);

          if (
            !latestByExercise[exId] ||
            entry.date > latestByExercise[exId].date
          ) {
            latestByExercise[exId] = entry;
          }
        }

        for (const exId of Object.keys(historyByExercise)) {
          historyByExercise[exId].sort((a, b) => b.date.localeCompare(a.date));
        }

        return exercises.map((r) => ({
          id: r.id,
          name: r.fields[EXERCISE_FIELDS.NAME] as string,
          muscleGroup: r.fields[EXERCISE_FIELDS.MUSCLE_GROUP] as string,
          latest: latestByExercise[r.id] ?? null,
          history: historyByExercise[r.id] ?? [],
        }));
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 1800, // 30 minutes soft TTL
        logTag: `workouts:exercises:${user.recordId}`,
      }
    );

    return NextResponse.json(
      { success: true, data: cacheResult.data },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Exercises fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch exercises" },
      { status: 500 }
    );
  }
}
