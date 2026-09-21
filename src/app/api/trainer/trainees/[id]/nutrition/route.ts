import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import {
  getRecords,
  getRecordById,
  createRecord,
  updateRecord,
} from "@/lib/airtable";
import {
  TABLES,
  MEMBER_FIELDS,
  NUTRITION_PLAN_FIELDS,
  NUTRITION_TEMPLATE_FIELDS,
} from "@/lib/constants";
import { assertTrainerCanManageTrainee } from "@/lib/trainingSchedule";
import { invalidateNutritionCache } from "@/lib/cacheService";
import { extractMealsFromFields, formatFieldsForSave } from "@/lib/nutritionParser";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: traineeId } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, traineeId))) {
      return NextResponse.json(
        { message: "This member is not accessible by you" },
        { status: 403 }
      );
    }

    const [plans, templates, memberRecord] = await Promise.all([
      getRecords(TABLES.NUTRITION_PLANS, { revalidate: 0 }),
      getRecords(TABLES.NUTRITION_TEMPLATES, { revalidate: 0 }),
      getRecordById(TABLES.MEMBERS, traineeId),
    ]);

    const linkedPlanIds = (memberRecord.fields[MEMBER_FIELDS.NUTRITION_PLANS] || []) as string[];

    const myPlan = plans.find((p) => {
      const members = p.fields[NUTRITION_PLAN_FIELDS.MEMBERS] as string[] | undefined;
      return (Array.isArray(members) && members.includes(traineeId)) || linkedPlanIds.includes(p.id);
    });

    const normalizePlan = (p: { id: string; fields: Record<string, unknown> }) => ({
      id: p.id,
      number: (p.fields[NUTRITION_PLAN_FIELDS.NUMBER] as string) || "",
      calories: Number(p.fields[NUTRITION_PLAN_FIELDS.CALORIES]) || 0,
      protein: Number(p.fields[NUTRITION_PLAN_FIELDS.PROTEIN]) || 0,
      carbs: Number(p.fields[NUTRITION_PLAN_FIELDS.CARBS]) || 0,
      fat: Number(p.fields[NUTRITION_PLAN_FIELDS.FAT]) || 0,
      goal: (p.fields[NUTRITION_PLAN_FIELDS.GOAL] as string) || "",
      status: (p.fields[NUTRITION_PLAN_FIELDS.STATUS] as string) || "نشطة",
      meals: extractMealsFromFields(p.fields),
    });

    return NextResponse.json({
      success: true,
      data: {
        plan: myPlan ? normalizePlan(myPlan) : null,
        templates: templates.map((t) => ({
          id: t.id,
          name: (t.fields[NUTRITION_TEMPLATE_FIELDS.NAME] as string) || "",
          goal: (t.fields[NUTRITION_TEMPLATE_FIELDS.GOAL] as string) || "",
          calories: Number(t.fields[NUTRITION_TEMPLATE_FIELDS.CALORIES]) || 0,
          protein: Number(t.fields[NUTRITION_TEMPLATE_FIELDS.PROTEIN]) || 0,
          carbs: Number(t.fields[NUTRITION_TEMPLATE_FIELDS.CARBS]) || 0,
          fat: Number(t.fields[NUTRITION_TEMPLATE_FIELDS.FAT]) || 0,
          meals: extractMealsFromFields(t.fields),
        })),
      },
    });
  } catch (error) {
    console.error("Trainer nutrition fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch nutrition data" },
      { status: 500 }
    );
  }
}

function normalizeNutritionGoal(rawGoal?: string): "زيادة العضل" | "تنشيف" | "تثبيت وزن" {
  if (!rawGoal) return "زيادة العضل";
  const g = String(rawGoal).toLowerCase().trim();
  if (
    g.includes("تنشيف") ||
    g.includes("خسارة") ||
    g.includes("حرق") ||
    g.includes("نقص") ||
    g.includes("fat") ||
    g.includes("cut") ||
    g.includes("loss") ||
    g.includes("diet") ||
    g.includes("ريجيم")
  ) {
    return "تنشيف";
  }
  if (
    g.includes("تثبيت") ||
    g.includes("محافظة") ||
    g.includes("صحة") ||
    g.includes("متوازن") ||
    g.includes("maintain") ||
    g.includes("maintenance") ||
    g.includes("fitness") ||
    g.includes("لياقة")
  ) {
    return "تثبيت وزن";
  }
  // Default and handles "تضخيم", "بناء", "زيادة", "عضل", "bulk", "muscle", etc.
  return "زيادة العضل";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: traineeId } = await params;

    if (!(await assertTrainerCanManageTrainee(user.recordId, traineeId))) {
      return NextResponse.json(
        { message: "This member is not accessible by you" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    const meals = Array.isArray(body.meals) ? body.meals : [];
    const mealFields = formatFieldsForSave(meals, { isTemplate: false });

    const fieldsToSave: Record<string, unknown> = {
      [NUTRITION_PLAN_FIELDS.CALORIES]: Number(body.calories) || 0,
      [NUTRITION_PLAN_FIELDS.PROTEIN]: Number(body.protein) || 0,
      [NUTRITION_PLAN_FIELDS.CARBS]: Number(body.carbs) || 0,
      [NUTRITION_PLAN_FIELDS.FAT]: Number(body.fat) || 0,
      [NUTRITION_PLAN_FIELDS.GOAL]: normalizeNutritionGoal(body.goal),
      ...mealFields,
    };

    // Check if member already has a nutrition plan (both via plan.المتدربين and member.جدول التغذية)
    const [allPlans, memberRecord] = await Promise.all([
      getRecords(TABLES.NUTRITION_PLANS),
      getRecordById(TABLES.MEMBERS, traineeId),
    ]);

    const linkedPlanIds = (memberRecord.fields[MEMBER_FIELDS.NUTRITION_PLANS] || []) as string[];

    const existingPlan = allPlans.find((p) => {
      const members = p.fields[NUTRITION_PLAN_FIELDS.MEMBERS] as string[] | undefined;
      return (Array.isArray(members) && members.includes(traineeId)) || linkedPlanIds.includes(p.id);
    });

    let savedRecordId = "";
    if (existingPlan) {
      await updateRecord(TABLES.NUTRITION_PLANS, existingPlan.id, fieldsToSave);
      savedRecordId = existingPlan.id;
    } else {
      fieldsToSave[NUTRITION_PLAN_FIELDS.MEMBERS] = [traineeId];
      fieldsToSave[NUTRITION_PLAN_FIELDS.STATUS] = "نشطة";
      const created = await createRecord(TABLES.NUTRITION_PLANS, fieldsToSave);
      savedRecordId = created.id;

      // Ensure member record also links to this nutrition plan
      try {
        const currentLinks = Array.isArray(memberRecord.fields[MEMBER_FIELDS.NUTRITION_PLANS])
          ? (memberRecord.fields[MEMBER_FIELDS.NUTRITION_PLANS] as string[])
          : [];
        if (!currentLinks.includes(savedRecordId)) {
          await updateRecord(TABLES.MEMBERS, traineeId, {
            [MEMBER_FIELDS.NUTRITION_PLANS]: [...currentLinks, savedRecordId],
          });
        }
      } catch (linkErr) {
        console.warn("Failed to link nutrition plan on member record:", linkErr);
      }
    }

    // Invalidate member's nutrition cache
    try {
      await invalidateNutritionCache(traineeId);
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Nutrition plan saved successfully",
      data: { id: savedRecordId, ...fieldsToSave, meals },
    });
  } catch (error) {
    console.error("Trainer nutrition save error:", error);
    const rawMessage = error instanceof Error ? error.message : "Failed to save nutrition plan";
    const sanitizedMessage = rawMessage.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]");
    return NextResponse.json(
      { message: sanitizedMessage },
      { status: 500 }
    );
  }
}
