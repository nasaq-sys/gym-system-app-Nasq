import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, getRecordById } from "@/lib/airtable";
import { TABLES, NUTRITION_PLAN_FIELDS, NUTRITION_TEMPLATE_FIELDS } from "@/lib/constants";
import { withCacheSWR } from "@/lib/cacheService";
import { extractMealsFromFields } from "@/lib/nutritionParser";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = `ultra-gym:member:nutrition:${user.recordId}`;

  try {
    const cacheResult = await withCacheSWR(
      cacheKey,
      async () => {
        const memberRecord = await getRecordById(TABLES.MEMBERS, user.recordId);
        const linkedPlanIds = (memberRecord.fields[NUTRITION_PLAN_FIELDS.MEMBERS] ||
          []) as string[];

        const [plans, templates] = await Promise.all([
          getRecords(TABLES.NUTRITION_PLANS, { revalidate: 300, tags: ["nutrition-plans"] }),
          getRecords(TABLES.NUTRITION_TEMPLATES, { revalidate: 300, tags: ["nutrition-templates"] }),
        ]);

        const myPlan = plans.find((p) =>
          (p.fields[NUTRITION_PLAN_FIELDS.MEMBERS] as string[])?.includes(
            user.recordId
          )
        );

        const normalize = (p: { id: string; fields: Record<string, unknown> }) => ({
          id: p.id,
          number: p.fields[NUTRITION_PLAN_FIELDS.NUMBER],
          calories: p.fields[NUTRITION_PLAN_FIELDS.CALORIES],
          protein: p.fields[NUTRITION_PLAN_FIELDS.PROTEIN],
          carbs: p.fields[NUTRITION_PLAN_FIELDS.CARBS],
          fat: p.fields[NUTRITION_PLAN_FIELDS.FAT],
          goal: p.fields[NUTRITION_PLAN_FIELDS.GOAL],
          status: p.fields[NUTRITION_PLAN_FIELDS.STATUS],
          meals: extractMealsFromFields(p.fields),
        });

        const planList = plans.map(normalize).filter((p) => linkedPlanIds.includes(p.id));

        return {
          myPlan: myPlan ? normalize(myPlan) : null,
          assignedPlans: planList,
          templates: templates.map((t) => ({
            id: t.id,
            name: t.fields[NUTRITION_TEMPLATE_FIELDS.NAME],
            goal: t.fields[NUTRITION_TEMPLATE_FIELDS.GOAL],
            calories: t.fields[NUTRITION_TEMPLATE_FIELDS.CALORIES],
            protein: t.fields[NUTRITION_TEMPLATE_FIELDS.PROTEIN],
            carbs: t.fields[NUTRITION_TEMPLATE_FIELDS.CARBS],
            fat: t.fields[NUTRITION_TEMPLATE_FIELDS.FAT],
            meals: extractMealsFromFields(t.fields),
          })),
        };
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 1800, // 30 minutes soft TTL
        logTag: `nutrition:${user.recordId}`,
      }
    );

    return NextResponse.json({
      success: true,
      data: cacheResult.data,
    });
  } catch (error) {
    console.error("Nutrition fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch nutrition data" },
      { status: 500 }
    );
  }
}
