import { getRecords } from "@/lib/airtable";
import { TABLES, LIVE_BOARD_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export async function getLiveGymCount(): Promise<number> {
  const result = await withCacheSWR<number>(
    REDIS_KEYS.GYM_COUNT,
    async () => {
      const records = await getRecords(TABLES.LIVE_BOARD, {
        maxRecords: 1,
        fields: [LIVE_BOARD_FIELDS.COUNT],
        revalidate: 60,
        tags: ["gym-count"],
      });

      const raw = records[0]?.fields[LIVE_BOARD_FIELDS.COUNT];
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        return 0;
      }
      return value;
    },
    {
      ttlSeconds: 600, // 10 minutes hard TTL
      softTtlSeconds: 120, // 2 minutes soft TTL
      logTag: "live:gym:count",
    }
  );

  return result.data ?? 0;
}
