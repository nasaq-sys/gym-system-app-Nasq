import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { feedbackSchema } from "@/lib/validations/feedbackSchema";
import { createRecord } from "@/lib/airtable";
import { TABLES, FEEDBACK_FIELDS } from "@/lib/constants";

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
    const validation = feedbackSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid feedback data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { message, type } = validation.data;

    // 3. Save sanitized feedback to Airtable
    const record = await createRecord(TABLES.FEEDBACK, {
      [FEEDBACK_FIELDS.MESSAGE]: message,
      [FEEDBACK_FIELDS.MEMBER]: [user.recordId],
      [FEEDBACK_FIELDS.STATUS]: "جديد",
      [FEEDBACK_FIELDS.TYPE]: type || "اقتراح",
    });

    return NextResponse.json({
      success: true,
      data: { id: record.id, fields: record.fields },
    });
  } catch (error) {
    console.error("Feedback submit error:", error);
    return NextResponse.json(
      { message: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}

