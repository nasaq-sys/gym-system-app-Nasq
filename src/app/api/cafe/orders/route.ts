import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { createCafeOrderSchema } from "@/lib/validations/cafeOrderSchema";
import {
  getRecords,
  createRecord,
  createRecords,
  getRecordById,
} from "@/lib/airtable";
import {
  TABLES,
  CAFE_ORDER_FIELDS,
  CAFE_ORDER_ITEM_FIELDS,
  CAFE_MENU_FIELDS,
  MAX_ORDER_ITEM_QTY,
} from "@/lib/constants";
import { invalidateCafeCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await getRecords(TABLES.CAFE_ORDERS, {
      sort: [{ field: CAFE_ORDER_FIELDS.TIME, direction: "desc" }],
      maxRecords: 50,
    });

    const result = orders.map((r) => ({
      id: r.id,
      orderNumber: r.fields[CAFE_ORDER_FIELDS.ORDER_NUMBER] as string,
      status: (r.fields[CAFE_ORDER_FIELDS.STATUS] as string) || "جديد",
      time: r.fields[CAFE_ORDER_FIELDS.TIME] as string,
      counter: r.fields[CAFE_ORDER_FIELDS.COUNTER] as number,
      customer: r.fields[CAFE_ORDER_FIELDS.CUSTOMER] as string[],
      notes: r.fields[CAFE_ORDER_FIELDS.NOTES] as string,
      items: r.fields[CAFE_ORDER_FIELDS.ITEMS] as string[],
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Cafe orders fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch orders" },
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
    const validation = createCafeOrderSchema.safeParse(rawBody);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return NextResponse.json(
        {
          error: "validation_failed",
          message: errorDetails[0]?.message || "Invalid order payload",
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    const { items } = validation.data;

    // 3. Stock validation against inventory (قائمة الطعام / المخزون)
    for (const item of items) {
      const record = await getRecordById(TABLES.CAFE_MENU, item.menuItemId).catch(() => null);
      if (!record) {
        return NextResponse.json(
          { error: "not_found", message: "أحد الأصناف المطلوبة غير موجود" },
          { status: 400 }
        );
      }
      const rawStock = record.fields[CAFE_MENU_FIELDS.MAX_QTY];
      const stockQty = typeof rawStock === "number" ? rawStock : 0;
      const isAvailable = Boolean(record.fields[CAFE_MENU_FIELDS.AVAILABLE]) && stockQty > 0;
      const itemName = (record.fields[CAFE_MENU_FIELDS.NAME] as string) || "الصنف";

      if (!isAvailable) {
        return NextResponse.json(
          {
            error: "out_of_stock",
            message: `الصنف "${itemName}" غير متوفر حالياً في المخزن`,
          },
          { status: 400 }
        );
      }

      const effectiveMax = Math.min(MAX_ORDER_ITEM_QTY, stockQty);
      if (item.quantity > effectiveMax) {
        return NextResponse.json(
          {
            error: "insufficient_stock",
            message: `الكمية المطلوبة من "${itemName}" (${item.quantity}) تتجاوز الحد الأقصى المسموح به (${effectiveMax})`,
          },
          { status: 400 }
        );
      }
    }

    // Create order — رقم الطلب and العداد are auto-computed by Airtable.
    const order = await createRecord(TABLES.CAFE_ORDERS, {
      [CAFE_ORDER_FIELDS.TIME]: new Date().toISOString(),
      [CAFE_ORDER_FIELDS.CUSTOMER]: [user.recordId],
    });

    // Read back to get computed order number
    const freshOrder = await getRecordById(TABLES.CAFE_ORDERS, order.id);
    const orderNumber = freshOrder.fields[CAFE_ORDER_FIELDS.ORDER_NUMBER] as string;

    // Create order item records
    const itemRecords = items.map((item) => ({
      fields: {
        [CAFE_ORDER_ITEM_FIELDS.ORDER]: [order.id],
        [CAFE_ORDER_ITEM_FIELDS.MENU_ITEM]: [item.menuItemId],
        [CAFE_ORDER_ITEM_FIELDS.QTY]: item.quantity,
      },
    }));

    await createRecords(TABLES.CAFE_ORDER_ITEMS, itemRecords);
    await invalidateCafeCache().catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber,
        status: "جديد",
      },
    });
  } catch (error) {
    console.error("Cafe order create error:", error);
    return NextResponse.json(
      { message: "Failed to create order" },
      { status: 500 }
    );
  }
}

