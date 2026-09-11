import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import { getRecordById, getRecordsByFilter } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS } from "@/lib/constants";
import { buildProfile } from "@/lib/memberProfile";
import { withCacheSWR, REDIS_KEYS } from "@/lib/cacheService";
import { checkMemberSubscriptionLifecycle } from "@/lib/subscriptionNotifications";

export async function GET(request: Request) {
  // 1. Zero Trust Authentication Check
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get("recordId");

  // Zero-Trust Authorization & IDOR Guard:
  // Regular members can ONLY access their own profile.
  // Querying other member IDs via `?recordId=` is strictly forbidden unless role is 'admin' or 'trainer'.
  if (recordId && recordId !== user.recordId) {
    if (user.role !== "admin" && user.role !== "trainer") {
      return NextResponse.json(
        { error: "Forbidden: You cannot access other members' profiles" },
        { status: 403 }
      );
    }
  }

  const targetId = recordId || user.recordId;
  const cacheKey = targetId
    ? REDIS_KEYS.MEMBER_PROFILE(targetId)
    : `ultra-gym:member:profile:email:${user.email.toLowerCase().trim()}`;

  try {
    const result = await withCacheSWR(
      cacheKey,
      async () => {
        let record;
        const cacheOpts = { revalidate: 15, tags: [`member-${targetId || user.email}`] };

        if (recordId) {
          record = await getRecordById(TABLES.MEMBERS, recordId, cacheOpts);
        } else if (user.recordId) {
          record = await getRecordById(TABLES.MEMBERS, user.recordId, cacheOpts);
        } else {
          const records = await getRecordsByFilter(
            TABLES.MEMBERS,
            `{${MEMBER_FIELDS.EMAIL}} = '${user.email.replace(/'/g, "\\'")}'`,
            { maxRecords: 1, ...cacheOpts }
          );
          record = records[0];
        }

        if (!record) {
          return null;
        }

        // Asynchronously check and send subscription notifications (renewal / expiring)
        checkMemberSubscriptionLifecycle(record).catch((err) => {
          console.error("[SubscriptionLifecycleCheck] Error:", err);
        });

        const f = record.fields;
        const get = (...keys: string[]): unknown => {
          for (const k of keys) {
            if (f[k] != null && f[k] !== "") return f[k];
          }
          return undefined;
        };

        return {
          recordId: record.id,
          memberId: get(MEMBER_FIELDS.ID) || record.id,
          name: get(MEMBER_FIELDS.NAME) || user.name,
          email: get(MEMBER_FIELDS.EMAIL) || user.email,
          phone: get(MEMBER_FIELDS.PHONE),
          gender: get(MEMBER_FIELDS.GENDER),
          age: get(MEMBER_FIELDS.AGE),
          dob: get(MEMBER_FIELDS.DOB),
          weight: get(MEMBER_FIELDS.WEIGHT),
          height: get(MEMBER_FIELDS.HEIGHT),
          bmi: get(MEMBER_FIELDS.BMI),
          balance: get(MEMBER_FIELDS.BALANCE),
          health: get(MEMBER_FIELDS.HEALTH),
          emergency: get(MEMBER_FIELDS.EMERGENCY),
          active: get(MEMBER_FIELDS.ACTIVE),
          nfc: get(MEMBER_FIELDS.NFC),
          joinDate: get(MEMBER_FIELDS.JOIN_DATE),
          rank: get(MEMBER_FIELDS.RANK),
          gateMessage: get(MEMBER_FIELDS.GATE_MESSAGE),
          subscriptionStatus: get(MEMBER_FIELDS.SUBSCRIPTION_STATUS),
          planType: get(MEMBER_FIELDS.PLAN_TYPE),
          trainerName: get(MEMBER_FIELDS.TRAINER_NAME),
          daysRemaining: get(MEMBER_FIELDS.DAYS_REMAINING),
          commitmentStatus: get(MEMBER_FIELDS.COMMITMENT_STATUS),
          totalSessions: get(MEMBER_FIELDS.TOTAL_SESSIONS),
          subStartDate: get(MEMBER_FIELDS.SUB_START_DATE),
          subEndDate: get(MEMBER_FIELDS.SUB_END_DATE),
          subStatus: get(MEMBER_FIELDS.SUB_STATUS),
          freezeDays: get(MEMBER_FIELDS.FREEZE_DAYS),
          classes: get(MEMBER_FIELDS.CLASSES),
          subscriptions: get(MEMBER_FIELDS.SUBSCRIPTIONS),
          cafeOrders: get(MEMBER_FIELDS.CAFE_ORDERS),
          fullProfile: buildProfile(record, "ar"),
        };
      },
      {
        ttlSeconds: 86400, // 24 hours
        softTtlSeconds: 120, // 2 minutes background revalidate
        logTag: `member-profile:${targetId || user.email}`,
      }
    );

    if (!result.data) {
      return NextResponse.json(
        { message: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        source: result.source,
        latencyMs: result.latencyMs,
        data: result.data,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
          "X-Cache-Source": result.source,
          "X-Cache-Latency": `${result.latencyMs}ms`,
        },
      }
    );
  } catch (error) {
    console.error("Member fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch member data" },
      { status: 500 }
    );
  }
}
