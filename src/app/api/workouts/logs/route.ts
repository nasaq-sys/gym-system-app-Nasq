import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyApiRequest } from "@/lib/serverAuth";
import { weightLogSchema } from "@/lib/validations/weightLogSchema";
import { createRecord, updateRecord, getRecordsByFilter } from "@/lib/airtable";
import { TABLES, WEIGHT_LOG_FIELDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 2. Strict Input Validation & Anti-XSS Sanitization via Zod
    const validation = weightLogSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid weight log data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { exerciseId, weight, reps, sets, sessionNotes } = validation.data;
    const today = new Date().toISOString().slice(0, 10);
    const setNumber = sets || 1;
    const setDetails = `الجولة ${setNumber}: ${weight}kg × ${reps || 0} تكرار`;
    const finalNotes = sessionNotes ? `${setDetails} (${sessionNotes})` : setDetails;

    // Create a dedicated separate row/record in Airtable for this specific set
    const newRecord = await createRecord(TABLES.WEIGHT_LOGS, {
      [WEIGHT_LOG_FIELDS.MEMBER]: [user.recordId],
      [WEIGHT_LOG_FIELDS.EXERCISE]: [exerciseId],
      [WEIGHT_LOG_FIELDS.WEIGHT]: weight,
      [WEIGHT_LOG_FIELDS.REPS]: reps || 0,
      [WEIGHT_LOG_FIELDS.SETS]: setNumber,
      [WEIGHT_LOG_FIELDS.DATE]: today,
      [WEIGHT_LOG_FIELDS.SESSION_NOTES]: finalNotes.slice(0, 500),
    });
    const recordId = newRecord.id;

    // Bust cache for exercises route
    revalidateTag("weight-logs", "max");
    revalidateTag(`weight-logs-${user.recordId}`, "max");

    return NextResponse.json({
      success: true,
      data: {
        id: recordId,
        weight,
        reps: reps || 0,
        sets: setNumber,
        date: today,
        sessionNotes: finalNotes,
      },
    });
  } catch (error) {
    console.error("Weight log save error:", error);
    return NextResponse.json(
      { message: "Failed to save weight log" },
      { status: 500 }
    );
  }
}

