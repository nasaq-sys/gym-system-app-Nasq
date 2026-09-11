import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { lostAndFoundSchema } from "@/lib/validations/lostAndFoundSchema";
import { getRecords, createRecord, type AirtableRecord } from "@/lib/airtable";
import { TABLES, LOST_FOUND_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";
import { deleteFromRedis } from "@/lib/redisClient";

export const dynamic = "force-dynamic";

const DEFAULT_STATUS = "قيد البحث";

export async function GET(request: Request) {
  // Cryptographically verify token at the API endpoint level (Zero Trust)
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized - Invalid, missing, or forged token" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";

  try {
    const cacheResult = await withCacheSWR<AirtableRecord[]>(
      REDIS_KEYS.LOST_FOUND,
      async () => {
        return await getRecords(TABLES.LOST_FOUND);
      },
      {
        ttlSeconds: 3600, // 1 hour hard TTL
        softTtlSeconds: 300, // 5 minutes soft TTL
        logTag: "lost_found:all",
      }
    );

    const records = cacheResult.data || [];

    const reports = records
      .filter(
        (r) =>
          !type ||
          (r.fields[LOST_FOUND_FIELDS.TYPE] as string) ===
            (type === "lost" ? "مفقودات" : "معثورات")
      )
      .map((r) => ({
        id: r.id,
        number: r.fields[LOST_FOUND_FIELDS.NUMBER],
        type: r.fields[LOST_FOUND_FIELDS.TYPE],
        itemName: r.fields[LOST_FOUND_FIELDS.ITEM_NAME],
        description: r.fields[LOST_FOUND_FIELDS.DESCRIPTION],
        location: r.fields[LOST_FOUND_FIELDS.LOCATION],
        date: r.fields[LOST_FOUND_FIELDS.DATE],
        status: r.fields[LOST_FOUND_FIELDS.STATUS],
        reporter: r.fields[LOST_FOUND_FIELDS.REPORTER] as string[] | undefined,
        receiver: r.fields[LOST_FOUND_FIELDS.RECEIVER],
        receivedDate: r.fields[LOST_FOUND_FIELDS.RECEIVED_DATE],
        createdTime: r.createdTime,
        isMine: (r.fields[LOST_FOUND_FIELDS.REPORTER] as string[] | undefined)?.includes(
          user.recordId
        ),
      }));

    reports.sort((a, b) => {
      const aDate = String(a.date || a.createdTime || "");
      const bDate = String(b.date || b.createdTime || "");
      const diff = bDate.localeCompare(aDate);
      return diff !== 0 ? diff : String(b.createdTime || "").localeCompare(String(a.createdTime || ""));
    });

    return NextResponse.json({ success: true, data: reports });
  } catch (error) {
    console.error("Lost & found fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Cryptographically verify token at the API endpoint level (Zero Trust)
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized - Invalid, missing, or forged token" },
      { status: 401 }
    );
  }

  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // ── Input Validation & Anti-XSS Sanitization via Zod ───────────────
    const validation = lostAndFoundSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid input data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { type, itemName, description, location, date } = validation.data;

    const fields: Record<string, unknown> = {
      [LOST_FOUND_FIELDS.TYPE]: type,
      [LOST_FOUND_FIELDS.ITEM_NAME]: itemName,
      [LOST_FOUND_FIELDS.STATUS]: DEFAULT_STATUS,
      [LOST_FOUND_FIELDS.REPORTER]: [user.recordId],
    };

    if (description) fields[LOST_FOUND_FIELDS.DESCRIPTION] = description;
    if (location) fields[LOST_FOUND_FIELDS.LOCATION] = location;
    if (date) fields[LOST_FOUND_FIELDS.DATE] = date.slice(0, 10);

    const record = await createRecord(TABLES.LOST_FOUND, fields);
    await deleteFromRedis(REDIS_KEYS.LOST_FOUND).catch(() => {});

    return NextResponse.json({ success: true, data: { id: record.id } });
  } catch (error) {
    console.error("Lost & found report error:", error);
    return NextResponse.json(
      { message: "Failed to submit report" },
      { status: 500 }
    );
  }
}


