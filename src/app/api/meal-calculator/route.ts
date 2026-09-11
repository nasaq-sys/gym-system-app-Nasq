import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import { TABLES, FOOD_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cacheResult = await withCacheSWR(
      REDIS_KEYS.FOOD_CATALOG,
      async () => {
        const records = await getRecords(TABLES.FOODS, {
          revalidate: 300,
          tags: ["foods"],
        });

        return records.map((r) => ({
          id: r.id,
          name: r.fields[FOOD_FIELDS.NAME],
          calories100g: Number(r.fields[FOOD_FIELDS.CALORIES_100G] || 0),
          protein100g: Number(r.fields[FOOD_FIELDS.PROTEIN_100G] || 0),
          fat100g: Number(r.fields[FOOD_FIELDS.FAT_100G] || 0),
          carbs100g: Number(r.fields[FOOD_FIELDS.CARBS_100G] || 0),
        }));
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 7200, // 2 hours soft TTL
        logTag: "foods:catalog:all",
      }
    );

    return NextResponse.json({ success: true, data: cacheResult.data });
  } catch (error) {
    console.error("Meal calculator fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch foods" },
      { status: 500 }
    );
  }
}
