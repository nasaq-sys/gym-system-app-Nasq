import { getRecords, getRecordById } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS } from "@/lib/constants";
import { sendNotificationToMembers } from "@/lib/notifications";
import { getFromRedis, setInRedis } from "@/lib/redisClient";
import { formatLongDate } from "@/lib/format";

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

function scalarNumber(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Notifies a member that their subscription has been renewed.
 * Uses a Redis lock key per member + subEndDate so duplicate notifications are never sent.
 */
export async function notifySubscriptionRenewed(
  memberRecordId: string,
  options?: {
    planType?: string;
    endDate?: string;
    startDate?: string;
    memberName?: string;
  }
) {
  try {
    let plan = options?.planType;
    let end = options?.endDate;
    let name = options?.memberName;

    if (!plan || !end) {
      const member = await getRecordById(TABLES.MEMBERS, memberRecordId);
      const f = member.fields;
      plan = plan || scalar(f[MEMBER_FIELDS.PLAN_TYPE]) || "اشتراكك الرياضي";
      end = end || scalar(f[MEMBER_FIELDS.SUB_END_DATE]);
      name = name || scalar(f[MEMBER_FIELDS.NAME]);
    }

    const dedupeKey = `ultra-gym:notif:sub-renewed:${memberRecordId}:${end || "latest"}`;
    const alreadySent = await getFromRedis<boolean>(dedupeKey);
    if (alreadySent) {
      return { sent: false, reason: "already_notified" };
    }

    const formattedEnd = end ? formatLongDate(end, "ar") : "";
    const title = "تم تجديد اشتراكك بنجاح";
    const body = formattedEnd
      ? `أهلاً بك! تم تجديد ${plan} في Nasaq Gym حتى ${formattedEnd}. نتمنى لك تدريباً ممتعاً!`
      : `أهلاً بك! تم تجديد ${plan} في Nasaq Gym بنجاح. نتمنى لك تدريباً ممتعاً!`;

    const result = await sendNotificationToMembers(
      [memberRecordId],
      title,
      body,
      "/home"
    );

    // Cache flag for 90 days
    await setInRedis(dedupeKey, true, 90 * 86400);

    return { sent: true, result };
  } catch (error) {
    console.error("[notifySubscriptionRenewed] error:", error);
    return { sent: false, error };
  }
}

/**
 * Notifies a member that their subscription is expiring soon.
 * Deduplicated per member + remaining days bucket so they only get 1 notification per milestone.
 */
export async function notifySubscriptionExpiring(
  memberRecordId: string,
  daysLeft: number,
  options?: {
    endDate?: string;
    planType?: string;
    memberName?: string;
  }
) {
  try {
    let end = options?.endDate;
    let name = options?.memberName;

    if (!end) {
      const member = await getRecordById(TABLES.MEMBERS, memberRecordId);
      const f = member.fields;
      end = end || scalar(f[MEMBER_FIELDS.SUB_END_DATE]);
      name = name || scalar(f[MEMBER_FIELDS.NAME]);
    }

    // Enforce interval policy: "يوم اه ويومين لا" (at least 3 days between notifications)
    const lastSentKey = `ultra-gym:notif:sub-expiring-last-sent:${memberRecordId}`;
    const lastSentDateStr = await getFromRedis<string>(lastSentKey);

    if (lastSentDateStr) {
      const lastSentTime = new Date(lastSentDateStr).getTime();
      const nowTime = Date.now();
      const daysSinceLastNotif = (nowTime - lastSentTime) / (1000 * 60 * 60 * 24);

      // Must wait at least 3 days (2 full days gap) before sending again,
      // unless it's the critical final day (daysLeft === 1) and was not sent today.
      if (daysSinceLastNotif < 2.8 && !(daysLeft === 1 && daysSinceLastNotif >= 0.9)) {
        return {
          sent: false,
          reason: "cooldown_interval_active",
          daysSinceLastNotif: Math.round(daysSinceLastNotif * 10) / 10,
        };
      }
    }

    const formattedEnd = end ? formatLongDate(end, "ar") : "";
    const title = "تنبيه: قارب اشتراكك على الانتهاء";
    const daysLabel =
      daysLeft === 1
        ? "يوم واحد"
        : daysLeft === 2
          ? "يومان"
          : `${daysLeft} أيام`;

    const body = formattedEnd
      ? `متبقي ${daysLabel} على انتهاء اشتراكك في Nasaq Gym (ينتهي بتاريخ ${formattedEnd}). جدد الآن لتستمر بدون انقطاع!`
      : `متبقي ${daysLabel} على انتهاء اشتراكك في Nasaq Gym. جدد الآن لتستمر بدون انقطاع!`;

    const result = await sendNotificationToMembers(
      [memberRecordId],
      title,
      body,
      "/profile"
    );

    // Record last sent timestamp in Redis (persisted for 30 days)
    await setInRedis(lastSentKey, new Date().toISOString(), 30 * 86400);

    return { sent: true, result };
  } catch (error) {
    console.error("[notifySubscriptionExpiring] error:", error);
    return { sent: false, error };
  }
}

/**
 * Checks a member's current subscription fields and sends expiration or renewal alerts if due.
 */
export async function checkMemberSubscriptionLifecycle(memberRecord: {
  id: string;
  fields: Record<string, unknown>;
}) {
  const f = memberRecord.fields;
  const status = scalar(f[MEMBER_FIELDS.SUB_STATUS] ?? f[MEMBER_FIELDS.SUBSCRIPTION_STATUS]);
  const daysRemaining = scalarNumber(f[MEMBER_FIELDS.DAYS_REMAINING]);
  const endDate = scalar(f[MEMBER_FIELDS.SUB_END_DATE]);
  const startDate = scalar(f[MEMBER_FIELDS.SUB_START_DATE]);
  const planType = scalar(f[MEMBER_FIELDS.PLAN_TYPE]);
  const memberName = scalar(f[MEMBER_FIELDS.NAME]);

  // If active and days remaining <= 5 and > 0, check expiring notification
  if (status === "نشط" && daysRemaining != null && daysRemaining > 0 && daysRemaining <= 5) {
    await notifySubscriptionExpiring(memberRecord.id, daysRemaining, {
      endDate,
      planType,
      memberName,
    });
  }

  // If newly started/renewed within the last 3 days
  if (status === "نشط" && startDate) {
    const startMs = new Date(startDate).getTime();
    const nowMs = Date.now();
    const diffDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
    if (diffDays >= 0 && diffDays <= 4) {
      await notifySubscriptionRenewed(memberRecord.id, {
        planType,
        endDate,
        startDate,
        memberName,
      });
    }
  }
}

/**
 * Batch scanner: checks all members whose subscriptions are expiring soon (<= 5 days) and alerts them.
 */
export async function scanAndNotifyExpiringSubscriptions(thresholdDays = 5) {
  const members = await getRecords(TABLES.MEMBERS);
  const results = {
    totalChecked: members.length,
    expiringFound: 0,
    notificationsSent: 0,
  };

  for (const m of members) {
    const f = m.fields;
    const status = scalar(f[MEMBER_FIELDS.SUB_STATUS] ?? f[MEMBER_FIELDS.SUBSCRIPTION_STATUS]);
    const days = scalarNumber(f[MEMBER_FIELDS.DAYS_REMAINING]);

    if (status === "نشط" && days != null && days > 0 && days <= thresholdDays) {
      results.expiringFound++;
      const res = await notifySubscriptionExpiring(m.id, days, {
        endDate: scalar(f[MEMBER_FIELDS.SUB_END_DATE]),
        planType: scalar(f[MEMBER_FIELDS.PLAN_TYPE]),
        memberName: scalar(f[MEMBER_FIELDS.NAME]),
      });
      if (res.sent) results.notificationsSent++;
    }
  }

  return results;
}

/**
 * Daily Automated Heartbeat:
 * Ensures the batch scan runs once per calendar day automatically in the background
 * without needing an external cron server.
 */
export async function triggerDailySubscriptionScanIfNeeded(thresholdDays = 5) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const lockKey = `ultra-gym:cron:daily-sub-check:${todayStr}`;
    const alreadyRan = await getFromRedis<boolean>(lockKey);
    if (alreadyRan) return;

    // Set 24h lock immediately to prevent duplicate runs
    await setInRedis(lockKey, true, 86400);

    // Run in background
    scanAndNotifyExpiringSubscriptions(thresholdDays).catch((err) => {
      console.error("[DailySubscriptionScan] Background error:", err);
    });
  } catch (err) {
    console.error("[triggerDailySubscriptionScanIfNeeded] Error:", err);
  }
}

