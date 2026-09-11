import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createPlanTemplateSchema } from "@/lib/validations/planTemplateSchema";
import { createRecord, createRecords } from "@/lib/airtable";
import {
  TABLES,
  PLAN_TEMPLATE_FIELDS,
  PLAN_TEMPLATE_ITEM_FIELDS,
} from "@/lib/constants";
import { getPlanTemplates } from "@/lib/trainingSchedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const templates = await getPlanTemplates();
    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Plan templates fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch plan templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
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

    // 2. Strict Input Validation via Zod
    const validation = createPlanTemplateSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid template data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { name, description, items } = validation.data;

    const template = await createRecord(TABLES.PLAN_TEMPLATES, {
      [PLAN_TEMPLATE_FIELDS.NAME]: name,
      [PLAN_TEMPLATE_FIELDS.DESCRIPTION]: description || "",
    });

    if (items && items.length > 0) {
      await createRecords(
        TABLES.PLAN_TEMPLATE_ITEMS,
        items.map((it) => ({
          fields: {
            [PLAN_TEMPLATE_ITEM_FIELDS.DESCRIPTION]: `${name} — ${it.day}`,
            [PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE]: [template.id],
            [PLAN_TEMPLATE_ITEM_FIELDS.DAY]: it.day,
            [PLAN_TEMPLATE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
            [PLAN_TEMPLATE_ITEM_FIELDS.REPS_SETS]: it.repsSets || "",
          },
        }))
      );
    }

    return NextResponse.json({ success: true, data: { id: template.id } });
  } catch (error) {
    console.error("Plan template create error:", error);
    return NextResponse.json(
      { message: "Failed to create plan template" },
      { status: 500 }
    );
  }
}

