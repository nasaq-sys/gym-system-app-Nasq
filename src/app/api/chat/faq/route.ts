import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecords } from "@/lib/airtable";
import { TABLES, FAQ_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

interface FaqQuestion {
  id: string;
  order: number;
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
}

interface FaqCategory {
  name: string;
  questions: FaqQuestion[];
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cacheResult = await withCacheSWR<{ categories: FaqCategory[] }>(
      REDIS_KEYS.CHAT_FAQ,
      async () => {
        const records = await getRecords(TABLES.FAQ, { revalidate: 300, tags: ["faq"] });
        const active = records.filter((r) => r.fields[FAQ_FIELDS.ACTIVE] !== false);

        const categories: string[] = [];
        const byCategory = new Map<string, FaqQuestion[]>();

        for (const r of active) {
          const cat = String(r.fields[FAQ_FIELDS.CATEGORY] || "عام");
          const qAr = String(r.fields[FAQ_FIELDS.QUESTION_AR] || "");
          const qEn = String(r.fields[FAQ_FIELDS.QUESTION_EN] || "");
          if (!qAr && !qEn) continue;

          const q: FaqQuestion = {
            id: r.id,
            order: Number(r.fields[FAQ_FIELDS.ORDER] ?? 0),
            qAr,
            qEn,
            aAr: String(r.fields[FAQ_FIELDS.ANSWER_AR] || ""),
            aEn: String(r.fields[FAQ_FIELDS.ANSWER_EN] || ""),
          };

          if (!byCategory.has(cat)) {
            byCategory.set(cat, []);
            categories.push(cat);
          }
          byCategory.get(cat)!.push(q);
        }

        // Stable display order
        categories.sort();

        return {
          categories: categories.map((cat) => ({
            name: cat,
            questions: (byCategory.get(cat) || []).sort(
              (a, b) => a.order - b.order
            ),
          })),
        };
      },
      {
        ttlSeconds: 604800, // 7 days hard TTL
        softTtlSeconds: 7200, // 2 hours soft TTL
        logTag: "chat:faq:all",
      }
    );

    return NextResponse.json({
      success: true,
      data: cacheResult.data,
    });
  } catch (error) {
    console.error("FAQ fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch FAQ" },
      { status: 500 }
    );
  }
}
