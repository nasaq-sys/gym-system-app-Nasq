import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, createRecord } from "@/lib/airtable";
import { TABLES, NUTRITION_TEMPLATE_FIELDS } from "@/lib/constants";
import { invalidateNutritionCache } from "@/lib/cacheService";
import { extractMealsFromFields, formatFieldsForSave } from "@/lib/nutritionParser";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user || (user.role !== "trainer" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const records = await getRecords(TABLES.NUTRITION_TEMPLATES, { revalidate: 0 });

    const templates = records.map((r) => ({
      id: r.id,
      name: (r.fields[NUTRITION_TEMPLATE_FIELDS.NAME] as string) || "",
      goal: (r.fields[NUTRITION_TEMPLATE_FIELDS.GOAL] as string) || "",
      calories: Number(r.fields[NUTRITION_TEMPLATE_FIELDS.CALORIES]) || 0,
      protein: Number(r.fields[NUTRITION_TEMPLATE_FIELDS.PROTEIN]) || 0,
      carbs: Number(r.fields[NUTRITION_TEMPLATE_FIELDS.CARBS]) || 0,
      fat: Number(r.fields[NUTRITION_TEMPLATE_FIELDS.FAT]) || 0,
      meals: extractMealsFromFields(r.fields),
    }));

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Failed to fetch nutrition templates:", error);
    return NextResponse.json(
      { message: "Failed to fetch nutrition templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user || (user.role !== "trainer" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.name?.trim()) {
      return NextResponse.json(
        { message: "Template name is required" },
        { status: 400 }
      );
    }

    const meals = Array.isArray(body.meals) ? body.meals : [];
    const mealFields = formatFieldsForSave(meals, { isTemplate: true });

    const fieldsToCreate: Record<string, unknown> = {
      [NUTRITION_TEMPLATE_FIELDS.NAME]: body.name.trim(),
      [NUTRITION_TEMPLATE_FIELDS.GOAL]: String(body.goal || "").trim(),
      [NUTRITION_TEMPLATE_FIELDS.CALORIES]: Number(body.calories) || 0,
      [NUTRITION_TEMPLATE_FIELDS.PROTEIN]: Number(body.protein) || 0,
      [NUTRITION_TEMPLATE_FIELDS.CARBS]: Number(body.carbs) || 0,
      [NUTRITION_TEMPLATE_FIELDS.FAT]: Number(body.fat) || 0,
      ...mealFields,
    };

    const created = await createRecord(TABLES.NUTRITION_TEMPLATES, fieldsToCreate);
    await invalidateNutritionCache();

    return NextResponse.json({
      success: true,
      message: "Template created successfully",
      data: { id: created.id, ...fieldsToCreate, meals },
    });
  } catch (error) {
    console.error("Failed to create nutrition template:", error);
    return NextResponse.json(
      { message: "Failed to create nutrition template" },
      { status: 500 }
    );
  }
}
