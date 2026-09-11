import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { updateCafeOrderStatusSchema } from "@/lib/validations/cafeOrderSchema";
import { updateRecord } from "@/lib/airtable";
import { TABLES, CAFE_ORDER_FIELDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

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
    const validation = updateCafeOrderStatusSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid status",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { status } = validation.data;

    await updateRecord(TABLES.CAFE_ORDERS, id, {
      [CAFE_ORDER_FIELDS.STATUS]: status,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cafe order update error:", error);
    return NextResponse.json(
      { message: "Failed to update order" },
      { status: 500 }
    );
  }
}

