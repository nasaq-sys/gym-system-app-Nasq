import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { updatePlanTemplateSchema } from "@/lib/validations/planTemplateSchema";
import {
  getRecords,
  updateRecord,
  deleteRecord,
  deleteRecords,
  createRecords,
} from "@/lib/airtable";
import {
  TABLES,
  PLAN_TEMPLATE_FIELDS,
  PLAN_TEMPLATE_ITEM_FIELDS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

async function getItemIdsForTemplate(templateId: string): Promise<string[]> {
  const items = await getRecords(TABLES.PLAN_TEMPLATE_ITEMS);
  return items
    .filter((item) => {
      const templateLinks =
        (item.fields[PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE] as string[] | undefined) ?? [];
      return templateLinks.includes(templateId);
    })
    .map((item) => item.id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
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
    const validation = updatePlanTemplateSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid update data",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const body = validation.data;

    const fields: Record<string, string> = {};
    if (body.name !== undefined) fields[PLAN_TEMPLATE_FIELDS.NAME] = body.name;
    if (body.description !== undefined)
      fields[PLAN_TEMPLATE_FIELDS.DESCRIPTION] = body.description;
    if (Object.keys(fields).length > 0) {
      await updateRecord(TABLES.PLAN_TEMPLATES, id, fields);
    }

    if (body.items) {
      const oldItemIds = await getItemIdsForTemplate(id);
      if (oldItemIds.length > 0) await deleteRecords(TABLES.PLAN_TEMPLATE_ITEMS, oldItemIds);

      const nameForDescription = body.name || "";
      if (body.items.length > 0) {
        await createRecords(
          TABLES.PLAN_TEMPLATE_ITEMS,
          body.items.map((it) => ({
            fields: {
              [PLAN_TEMPLATE_ITEM_FIELDS.DESCRIPTION]: `${nameForDescription} — ${it.day}`,
              [PLAN_TEMPLATE_ITEM_FIELDS.TEMPLATE]: [id],
              [PLAN_TEMPLATE_ITEM_FIELDS.DAY]: it.day,
              [PLAN_TEMPLATE_ITEM_FIELDS.EXERCISE]: [it.exerciseId],
              [PLAN_TEMPLATE_ITEM_FIELDS.REPS_SETS]: it.repsSets || "",
            },
          }))
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Plan template update error:", error);
    return NextResponse.json(
      { message: "Failed to update plan template" },
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
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const itemIds = await getItemIdsForTemplate(id);
    if (itemIds.length > 0) await deleteRecords(TABLES.PLAN_TEMPLATE_ITEMS, itemIds);

    await deleteRecord(TABLES.PLAN_TEMPLATES, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Plan template delete error:", error);
    return NextResponse.json(
      { message: "Failed to delete plan template" },
      { status: 500 }
    );
  }
}

