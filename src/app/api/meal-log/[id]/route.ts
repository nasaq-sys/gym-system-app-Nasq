import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { updateMealLogSchema } from "@/lib/validations/mealLogSchema";
import { getRecordById, updateRecord, deleteRecord } from "@/lib/airtable";
import { TABLES, MEAL_CALCULATOR_FIELDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

async function assertOwnership(id: string, memberRecordId: string) {
  const record = await getRecordById(TABLES.MEAL_CALCULATOR, id);
  const memberLinks = record.fields[MEAL_CALCULATOR_FIELDS.MEMBER];
  const linkedIds = Array.isArray(memberLinks) ? (memberLinks as string[]) : [];
  return linkedIds.includes(memberRecordId);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 2. Strict Input Validation via Zod
    const validation = updateMealLogSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid quantity",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { quantityG } = validation.data;

    if (!(await assertOwnership(id, user.recordId))) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const record = await updateRecord(TABLES.MEAL_CALCULATOR, id, {
      [MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS]: quantityG,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        quantityG: Number(record.fields[MEAL_CALCULATOR_FIELDS.QUANTITY_GRAMS] || 0),
        calories: Number(record.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CALORIES] || 0),
        protein: Number(record.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_PROTEIN] || 0),
        carbs: Number(record.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_CARBS] || 0),
        fat: Number(record.fields[MEAL_CALCULATOR_FIELDS.ACTUAL_FAT] || 0),
      },
    });
  } catch (error) {
    console.error("Meal log update error:", error);
    return NextResponse.json(
      { message: "Failed to update meal" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!(await assertOwnership(id, user.recordId))) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    await deleteRecord(TABLES.MEAL_CALCULATOR, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Meal log delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete meal" },
      { status: 500 }
    );
  }
}

