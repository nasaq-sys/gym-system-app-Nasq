import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { storeOrderSchema } from "@/lib/validations/storeOrderSchema";
import {
  createRecord,
  createRecords,
  getRecordById,
} from "@/lib/airtable";
import {
  TABLES,
  STORE_ORDER_FIELDS,
  STORE_ORDER_ITEM_FIELDS,
  STORE_PRODUCT_FIELDS,
  MAX_ORDER_ITEM_QTY,
} from "@/lib/constants";
import { invalidateStoreCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

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
    const validation = storeOrderSchema.safeParse(rawBody);
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

    // 3. Stock validation against inventory (منتجات المتجر / المخزون)
    for (const item of items) {
      const record = await getRecordById(TABLES.STORE_PRODUCTS, item.productId).catch(() => null);
      if (!record) {
        return NextResponse.json(
          { error: "not_found", message: "أحد المنتجات المطلوبة غير موجود" },
          { status: 400 }
        );
      }
      const rawStock = record.fields[STORE_PRODUCT_FIELDS.QUANTITY];
      const stockQty = typeof rawStock === "number" ? rawStock : 0;
      const status = (record.fields[STORE_PRODUCT_FIELDS.STATUS] as string) || "";
      const isAvailable = stockQty > 0 && !status.includes("نفد") && !status.includes("غير متوفر");
      const productName = (record.fields[STORE_PRODUCT_FIELDS.NAME] as string) || "المنتج";

      if (!isAvailable) {
        return NextResponse.json(
          {
            error: "out_of_stock",
            message: `المنتج "${productName}" غير متوفر حالياً في المخزن`,
          },
          { status: 400 }
        );
      }

      const effectiveMax = Math.min(MAX_ORDER_ITEM_QTY, stockQty);
      if (item.quantity > effectiveMax) {
        return NextResponse.json(
          {
            error: "insufficient_stock",
            message: `الكمية المطلوبة من "${productName}" (${item.quantity}) تتجاوز الحد الأقصى المسموح به (${effectiveMax})`,
          },
          { status: 400 }
        );
      }
    }

    // Create order — رقم الطلب and العداد are auto-computed by Airtable.
    const order = await createRecord(TABLES.STORE_ORDERS, {
      [STORE_ORDER_FIELDS.STATUS]: "جديد",
      [STORE_ORDER_FIELDS.TIME]: new Date().toISOString(),
      [STORE_ORDER_FIELDS.CUSTOMER]: [user.recordId],
    });

    // Read back to get computed order number
    const freshOrder = await getRecordById(TABLES.STORE_ORDERS, order.id);
    const orderNumber = freshOrder.fields[STORE_ORDER_FIELDS.ORDER_NUMBER] as string;

    // Create order item records
    const itemRecords = items.map((item) => ({
      fields: {
        [STORE_ORDER_ITEM_FIELDS.ORDER]: [order.id],
        [STORE_ORDER_ITEM_FIELDS.PRODUCT]: [item.productId],
        [STORE_ORDER_ITEM_FIELDS.QTY]: item.quantity,
      },
    }));

    await createRecords(TABLES.STORE_ORDER_ITEMS, itemRecords);
    await invalidateStoreCache().catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber,
        status: "جديد",
      },
    });
  } catch (error) {
    console.error("Store order create error:", error);
    return NextResponse.json(
      { message: "Failed to create order" },
      { status: 500 }
    );
  }
}

