import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordById, getRecords } from "@/lib/airtable";
import { TABLES, TRAINER_FIELDS, MEMBER_FIELDS } from "@/lib/constants";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

function scalarNumber(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user || user.role !== "trainer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cacheKey = REDIS_KEYS.TRAINER_TRAINEES(user.recordId);

  try {
    const result = await withCacheSWR(
      cacheKey,
      async () => {
        const [trainer, allMembers] = await Promise.all([
          getRecordById(TABLES.TRAINERS, user.recordId, {
            revalidate: 30,
            tags: [`trainer-${user.recordId}`],
          }).catch(() => null),
          getRecords(TABLES.MEMBERS, {
            revalidate: 30,
            tags: ["members"],
          }),
        ]);

        const linkedIds = new Set(
          (trainer?.fields[TRAINER_FIELDS.MEMBERS] as string[] | undefined) ?? []
        );

        const normalizeMember = (m: { id: string; fields: Record<string, unknown> }) => {
          const planType = scalar(m.fields[MEMBER_FIELDS.PLAN_TYPE]) || "اشتراك عام";
          const subStatus = scalar(
            m.fields[MEMBER_FIELDS.SUB_STATUS] ??
              m.fields[MEMBER_FIELDS.SUBSCRIPTION_STATUS]
          ) || "نشط";
          const isMine = linkedIds.has(m.id);
          const isFree =
            planType.toLowerCase().includes("حر") ||
            planType.toLowerCase().includes("عام") ||
            planType.toLowerCase().includes("free") ||
            !isMine;

          return {
            id: m.id,
            name: scalar(m.fields[MEMBER_FIELDS.NAME]) || "عضو",
            phone: scalar(m.fields[MEMBER_FIELDS.PHONE]),
            email: scalar(m.fields[MEMBER_FIELDS.EMAIL]),
            active: scalar(m.fields[MEMBER_FIELDS.ACTIVE]) || "نعم",
            planType,
            subStatus,
            daysRemaining: scalarNumber(m.fields[MEMBER_FIELDS.DAYS_REMAINING]),
            isMine,
            isFree,
            category: isMine ? ("assigned" as const) : isFree ? ("free" as const) : ("other" as const),
          };
        };

        const parsed = allMembers
          .map(normalizeMember)
          .filter((m) => m.name && m.name !== "عضو")
          .sort((a, b) => a.name.localeCompare(b.name));

        const assigned = parsed.filter((m) => m.isMine);
        const free = parsed.filter((m) => m.isFree && !m.isMine);

        return {
          all: parsed,
          assigned,
          free,
        };
      },
      {
        ttlSeconds: 600,
        softTtlSeconds: 60,
        logTag: `trainer:trainees:${user.recordId}`,
      }
    );

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("Trainer trainees fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch trainees" },
      { status: 500 }
    );
  }
}
