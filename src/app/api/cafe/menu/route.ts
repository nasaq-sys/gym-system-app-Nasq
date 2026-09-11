import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, getAttachmentUrl } from "@/lib/airtable";
import { TABLES, CAFE_MENU_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cacheResult = await withCacheSWR(
      REDIS_KEYS.CAFE_MENU,
      async () => {
        const records = await getRecords(TABLES.CAFE_MENU, {
          sort: [{ field: CAFE_MENU_FIELDS.CATEGORY, direction: "asc" }],
          revalidate: 120,
          tags: ["cafe-menu"],
        });

        return records.map((r) => {
          const rawStock = r.fields[CAFE_MENU_FIELDS.MAX_QTY];
          const stockQty = typeof rawStock === "number" ? rawStock : 0;
          const isExplicitlyAvailable = Boolean(r.fields[CAFE_MENU_FIELDS.AVAILABLE]);
          const available = isExplicitlyAvailable && stockQty > 0;

          return {
            id: r.id,
            name: r.fields[CAFE_MENU_FIELDS.NAME] as string,
            price: r.fields[CAFE_MENU_FIELDS.PRICE] as number,
            category: r.fields[CAFE_MENU_FIELDS.CATEGORY] as string,
            available,
            stockQty,
            image: getAttachmentUrl(r.fields[CAFE_MENU_FIELDS.IMAGE]),
          };
        });
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 3600, // 1 hour soft TTL
        logTag: "cafe:menu:all",
      }
    );

    return NextResponse.json(
      { success: true, data: cacheResult.data },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Cafe menu fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch menu" },
      { status: 500 }
    );
  }
}
