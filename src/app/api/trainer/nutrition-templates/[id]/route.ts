import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { updateRecord, deleteRecords } from "@/lib/airtable";
import { TABLES, NUTRITION_TEMPLATE_FIELDS } from "@/lib/constants";
import { invalidateNutritionCache } from "@/lib/cacheService";
import { formatFieldsForSave } from "@/lib/nutritionParser";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user || (user.role !== "trainer" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    const fieldsToUpdate: Record<string, unknown> = {};

    if (typeof body.name === "string") fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.NAME] = body.name.trim();
    if (typeof body.goal === "string") fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.GOAL] = body.goal.trim();
    if (body.calories !== undefined) fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.CALORIES] = Number(body.calories) || 0;
    if (body.protein !== undefined) fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.PROTEIN] = Number(body.protein) || 0;
    if (body.carbs !== undefined) fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.CARBS] = Number(body.carbs) || 0;
    if (body.fat !== undefined) fieldsToUpdate[NUTRITION_TEMPLATE_FIELDS.FAT] = Number(body.fat) || 0;

    if (Array.isArray(body.meals)) {
      const mealFields = formatFieldsForSave(body.meals, { isTemplate: true });
      Object.assign(fieldsToUpdate, mealFields);
    }

    await updateRecord(TABLES.NUTRITION_TEMPLATES, id, fieldsToUpdate);
    await invalidateNutritionCache();

    return NextResponse.json({
      success: true,
      message: "Template updated successfully",
    });
  } catch (error) {
    console.error("Failed to update nutrition template:", error);
    return NextResponse.json(
      { message: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user || (user.role !== "trainer" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteRecords(TABLES.NUTRITION_TEMPLATES, [id]);
    await invalidateNutritionCache();

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete nutrition template:", error);
    return NextResponse.json(
      { message: "Failed to delete template" },
      { status: 500 }
    );
  }
}
