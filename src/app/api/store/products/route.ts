import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords, getAttachmentUrl } from "@/lib/airtable";
import { TABLES, STORE_PRODUCT_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cacheResult = await withCacheSWR(
      REDIS_KEYS.STORE_PRODUCTS,
      async () => {
        const records = await getRecords(TABLES.STORE_PRODUCTS, {
          sort: [{ field: STORE_PRODUCT_FIELDS.CATEGORY, direction: "asc" }],
          revalidate: 120,
          tags: ["store-products"],
        });

        return records.map((r) => ({
          id: r.id,
          name: r.fields[STORE_PRODUCT_FIELDS.NAME] as string,
          price: r.fields[STORE_PRODUCT_FIELDS.PRICE] as number,
          category: r.fields[STORE_PRODUCT_FIELDS.CATEGORY] as string,
          stockStatus: r.fields[STORE_PRODUCT_FIELDS.STATUS] as string,
          stockQty: r.fields[STORE_PRODUCT_FIELDS.QUANTITY] as number,
          minAlert: r.fields[STORE_PRODUCT_FIELDS.MIN_ALERT] as number,
          image: getAttachmentUrl(r.fields[STORE_PRODUCT_FIELDS.IMAGE]),
        }));
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 3600, // 1 hour soft TTL
        logTag: "store:products:all",
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
    console.error("Store products fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
