import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import {
  TABLES,
  CAFE_ORDER_FIELDS,
  CAFE_ORDER_ITEM_FIELDS,
  CAFE_MENU_FIELDS,
  STORE_ORDER_FIELDS,
  STORE_ORDER_ITEM_FIELDS,
  STORE_PRODUCT_FIELDS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

interface OrderItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface MyOrder {
  id: string;
  type: "cafe" | "store";
  orderNumber: string;
  status: string;
  time: string;
  counter: number;
  notes: string;
  items: OrderItem[];
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Previously resolved each order's items with one getRecordById call per
    // item, sequentially (awaited inside a for-loop) — a member with a dozen
    // past orders could trigger dozens of one-at-a-time round-trips to
    // Airtable just to open "My Orders". Now fetches both items tables in
    // full up front (same fix already used by /api/admin/orders, which lists
    // every order in the gym and hits this far harder) and looks items up
    // in-memory instead.
    const [cafeOrders, storeOrders, cafeItems, storeItems, cafeMenu, storeProducts] =
      await Promise.all([
        getRecords(TABLES.CAFE_ORDERS, {
          sort: [{ field: CAFE_ORDER_FIELDS.TIME, direction: "desc" }],
          maxRecords: 100,
        }),
        getRecords(TABLES.STORE_ORDERS, {
          sort: [{ field: STORE_ORDER_FIELDS.TIME, direction: "desc" }],
          maxRecords: 100,
        }),
        getRecords(TABLES.CAFE_ORDER_ITEMS),
        getRecords(TABLES.STORE_ORDER_ITEMS),
        getRecords(TABLES.CAFE_MENU),
        getRecords(TABLES.STORE_PRODUCTS),
      ]);

    const menuName = new Map(
      cafeMenu.map((r) => [r.id, r.fields[CAFE_MENU_FIELDS.NAME] as string])
    );
    const productName = new Map(
      storeProducts.map((r) => [r.id, r.fields[STORE_PRODUCT_FIELDS.NAME] as string])
    );

    function itemsByOrder(
      items: { id: string; fields: Record<string, unknown> }[],
      orderField: string,
      qtyField: string,
      priceField: string,
      totalField: string,
      descField: string,
      linkField: string,
      nameMap: Map<string, string>
    ) {
      const map = new Map<string, OrderItem[]>();
      for (const it of items) {
        const orderIds = (it.fields[orderField] as string[] | undefined) || [];
        const linked = (it.fields[linkField] as string[] | undefined)?.[0];
        const qty = Number(it.fields[qtyField] ?? 0);
        const unitPrice = Number(it.fields[priceField] ?? 0);
        const computedTotal = unitPrice * qty;
        const total = Number(it.fields[totalField] ?? computedTotal) || computedTotal;
        const desc = it.fields[descField] as string | undefined;
        const entry: OrderItem = {
          name: (linked ? nameMap.get(linked) : "") || desc?.split(" - ")[0] || "—",
          qty,
          unitPrice,
          total,
        };
        for (const oid of orderIds) {
          if (!map.has(oid)) map.set(oid, []);
          map.get(oid)!.push(entry);
        }
      }
      return map;
    }

    const cafeItemsByOrder = itemsByOrder(
      cafeItems,
      CAFE_ORDER_ITEM_FIELDS.ORDER,
      CAFE_ORDER_ITEM_FIELDS.QTY,
      CAFE_ORDER_ITEM_FIELDS.UNIT_PRICE,
      CAFE_ORDER_ITEM_FIELDS.TOTAL,
      CAFE_ORDER_ITEM_FIELDS.DESCRIPTION,
      CAFE_ORDER_ITEM_FIELDS.MENU_ITEM,
      menuName
    );
    const storeItemsByOrder = itemsByOrder(
      storeItems,
      STORE_ORDER_ITEM_FIELDS.ORDER,
      STORE_ORDER_ITEM_FIELDS.QTY,
      STORE_ORDER_ITEM_FIELDS.PRICE,
      STORE_ORDER_ITEM_FIELDS.TOTAL,
      STORE_ORDER_ITEM_FIELDS.DESCRIPTION,
      STORE_ORDER_ITEM_FIELDS.PRODUCT,
      productName
    );

    const belongsTo = (customers: unknown) =>
      Array.isArray(customers) && customers.includes(user.recordId);

    const myCafe = cafeOrders.filter((r) => belongsTo(r.fields[CAFE_ORDER_FIELDS.CUSTOMER]));
    const myStore = storeOrders.filter((r) =>
      belongsTo(r.fields[STORE_ORDER_FIELDS.CUSTOMER])
    );

    const orders: MyOrder[] = [];

    for (const r of myCafe) {
      orders.push({
        id: r.id,
        type: "cafe",
        orderNumber: (r.fields[CAFE_ORDER_FIELDS.ORDER_NUMBER] as string) || r.id,
        status: (r.fields[CAFE_ORDER_FIELDS.STATUS] as string) || "جديد",
        time: r.fields[CAFE_ORDER_FIELDS.TIME] as string,
        counter: r.fields[CAFE_ORDER_FIELDS.COUNTER] as number,
        notes: r.fields[CAFE_ORDER_FIELDS.NOTES] as string,
        items: cafeItemsByOrder.get(r.id) || [],
      });
    }

    for (const r of myStore) {
      orders.push({
        id: r.id,
        type: "store",
        orderNumber: (r.fields[STORE_ORDER_FIELDS.ORDER_NUMBER] as string) || r.id,
        status: (r.fields[STORE_ORDER_FIELDS.STATUS] as string) || "جديد",
        time: r.fields[STORE_ORDER_FIELDS.TIME] as string,
        counter: r.fields[STORE_ORDER_FIELDS.COUNTER] as number,
        notes: r.fields[STORE_ORDER_FIELDS.NOTES] as string,
        items: storeItemsByOrder.get(r.id) || [],
      });
    }

    orders.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error("My orders fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
