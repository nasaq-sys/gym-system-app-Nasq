import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordsByFilter } from "@/lib/airtable";
import { TABLES, INBODY_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = REDIS_KEYS.MEMBER_STATS(user.recordId || user.email);

  try {
    const result = await withCacheSWR(
      cacheKey,
      async () => {
        const memberEmail = user.email;

        const inbodyRecords = await getRecordsByFilter(
          TABLES.INBODY_SCANS,
          `{${INBODY_FIELDS.MEMBER_EMAIL}} = '${memberEmail.replace(/'/g, "\\'")}'`,
          { maxRecords: 50, revalidate: 30, tags: [`inbody-${user.recordId}`] }
        )
          .then((records) =>
            [...records].sort(
              (a, b) =>
                new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
            )
          )
          .catch((e) => {
            console.error("InBody fetch failed:", e.message);
            return [];
          });

        // InBody scan history (for chart)
        const scanHistory = inbodyRecords
          .map((r) => ({
            date: r.createdTime,
            bodyFat: r.fields[INBODY_FIELDS.BODY_FAT] as number,
            weight: r.fields[INBODY_FIELDS.WEIGHT] as number | undefined,
            muscleMass: r.fields[INBODY_FIELDS.MUSCLE_MASS] as number | undefined,
            goal: r.fields[INBODY_FIELDS.GOAL] as string,
            recordId: r.id,
          }))
          .filter((s) => s.bodyFat != null);

        const latestScan = scanHistory[0] || null;

        return {
          inBody: {
            latest: latestScan,
            history: scanHistory,
          },
        };
      },
      {
        ttlSeconds: 86400,
        softTtlSeconds: 300,
        logTag: `member-stats:${user.recordId || user.email}`,
      }
    );

    return NextResponse.json(
      {
        success: true,
        source: result.source,
        latencyMs: result.latencyMs,
        data: result.data,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
          "X-Cache-Source": result.source,
          "X-Cache-Latency": `${result.latencyMs}ms`,
        },
      }
    );
  } catch (error) {
    console.error("Stats fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
