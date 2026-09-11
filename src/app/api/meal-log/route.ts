import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createMealLogSchema } from "@/lib/validations/mealLogSchema";
import { getRecordsByFilter, createRecord } from "@/lib/airtable";
import { TABLES, MEAL_CALCULATOR_FIELDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface MealLogFields {
  [key: string]: unknown;
}

function mapEntry(id: string, fields: MealLogFields) {
  return {
    id,
    name: (fields[MEAL_CALCULATOR_FIELDS.DESCRIPTION] as string) || "—",
    quantityG: Number(fields[MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS] || 0),
    calories: Number(fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CALORIES] || 0),
    protein: Number(fields[MEAL_CALCULATOR_FIELDS.ACTUAL_PROTEIN] || 0),
    carbs: Number(fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CARBS] || 0),
    fat: Number(fields[MEAL_CALCULATOR_FIELDS.ACTUAL_FAT] || 0),
  };
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayStr();

  try {
    const records = await getRecordsByFilter(
      TABLES.MEAL_CALCULATOR,
      `IS_SAME({${MEAL_CALCULATOR_FIELDS.DATE}}, '${date}', 'day')`,
      {
        fields: [
          MEAL_CALCULATOR_FIELDS.MEMBER,
          MEAL_CALCULATOR_FIELDS.DESCRIPTION,
          MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS,
          MEAL_CALCULATOR_FIELDS.ACTUAL_CALORIES,
          MEAL_CALCULATOR_FIELDS.ACTUAL_PROTEIN,
          MEAL_CALCULATOR_FIELDS.ACTUAL_CARBS,
          MEAL_CALCULATOR_FIELDS.ACTUAL_FAT,
        ],
        maxRecords: 500,
      }
    ).catch((e) => {
      console.error("Meal log fetch failed:", e.message);
      return [];
    });

    const entries = records
      .filter((r) => {
        const memberLinks = r.fields[MEAL_CALCULATOR_FIELDS.MEMBER];
        const linkedIds = Array.isArray(memberLinks) ? (memberLinks as string[]) : [];
        return linkedIds.includes(user.recordId);
      })
      .sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime())
      .map((r) => mapEntry(r.id, r.fields));

    return NextResponse.json({ success: true, data: { date, entries } });
  } catch (error) {
    console.error("Meal log fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch meal log" },
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
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 2. Strict Input Validation & Anti-XSS Sanitization via Zod
    const validation = createMealLogSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid meal data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { foodId, name, quantityG } = validation.data;

    const record = await createRecord(TABLES.MEAL_CALCULATOR, {
      [MEAL_CALCULATOR_FIELDS.FOOD_LINK]: [foodId],
      [MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS]: quantityG,
      [MEAL_CALCULATOR_FIELDS.MEMBER]: [user.recordId],
      [MEAL_CALCULATOR_FIELDS.DATE]: todayStr(),
      [MEAL_CALCULATOR_FIELDS.DESCRIPTION]: name || "—",
    });

    return NextResponse.json({ success: true, data: mapEntry(record.id, record.fields) });
  } catch (error) {
    console.error("Meal log create error:", error);
    return NextResponse.json(
      { message: "Failed to log meal" },
      { status: 500 }
    );
  }
}

