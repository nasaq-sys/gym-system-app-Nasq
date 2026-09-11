import { getRecords, createRecords, updateRecord, deleteRecord } from "@/lib/airtable";
import { TABLES, NOTIFICATION_FIELDS } from "@/lib/constants";
import { sendPushToMembers } from "@/lib/webPush";
import { withCacheSWR, invalidateNotificationsCache, REDIS_KEYS } from "@/lib/cacheService";

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export interface SendNotificationResult {
  inAppCount: number;
  pushSentCount: number;
  totalDevices: number;
  notificationId: string;
}

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

/**
 * All notifications for one member, newest first.
 * Cached in Redis with SWR for instant responses (< 15ms).
 */
export async function getMemberNotifications(
  memberRecordId: string
): Promise<NotificationView[]> {
  const cacheKey = REDIS_KEYS.MEMBER_NOTIFICATIONS(memberRecordId);

  const result = await withCacheSWR(
    cacheKey,
    async () => {
      const records = await getRecords(TABLES.NOTIFICATIONS, {
        pageSize: 100,
        maxRecords: 100,
        sort: [{ field: NOTIFICATION_FIELDS.DATE, direction: "desc" }],
        revalidate: 30,
        tags: [`notifs-${memberRecordId}`],
      });

      return records
        .filter((r) => {
          const links = r.fields[NOTIFICATION_FIELDS.MEMBER];
          const linkedIds = Array.isArray(links) ? (links as string[]) : [];
          return linkedIds.includes(memberRecordId);
        })
        .map((r) => ({
          id: r.id,
          title: scalar(r.fields[NOTIFICATION_FIELDS.TITLE]),
          body: scalar(r.fields[NOTIFICATION_FIELDS.BODY]),
          date: scalar(r.fields[NOTIFICATION_FIELDS.DATE]),
          read: Boolean(r.fields[NOTIFICATION_FIELDS.READ]),
          createdTime: r.createdTime,
        }))
        .sort((a, b) => {
          // Sort newest to oldest: compare date, then createdTime
          const timeA = a.date ? new Date(a.date).getTime() : 0;
          const timeB = b.date ? new Date(b.date).getTime() : 0;
          if (timeA !== timeB) return timeB - timeA;
          return (b.createdTime || "").localeCompare(a.createdTime || "");
        });
    },
    {
      ttlSeconds: 3600, // 1 hour
      softTtlSeconds: 60, // 1 minute background revalidate
      logTag: `notifications:${memberRecordId}`,
    }
  );

  return result.data;
}

// Creates in-app notification rows per recipient and fans out Web Push across all their registered devices.
// Generates a single master notificationId so all devices and in-app rows are linked to one delivery lifecycle.
export async function sendNotificationToMembers(
  memberRecordIds: string[],
  title: string,
  body: string,
  url?: string,
  memberNamesMap?: Record<string, string>,
  customNotificationId?: string
): Promise<SendNotificationResult> {
  const uniqueIds = [...new Set(memberRecordIds)].filter(Boolean);
  const notificationId =
    customNotificationId || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (uniqueIds.length === 0) {
    return {
      inAppCount: 0,
      pushSentCount: 0,
      totalDevices: 0,
      notificationId,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { records } = await createRecords(
    TABLES.NOTIFICATIONS,
    uniqueIds.map((memberId) => ({
      fields: {
        [NOTIFICATION_FIELDS.TITLE]: title,
        [NOTIFICATION_FIELDS.BODY]: body,
        [NOTIFICATION_FIELDS.DATE]: today,
        [NOTIFICATION_FIELDS.MEMBER]: [memberId],
        [NOTIFICATION_FIELDS.READ]: false,
      },
    }))
  );

  // Invalidate Redis notification cache for all recipient members
  Promise.allSettled(uniqueIds.map((id) => invalidateNotificationsCache(id))).catch(() => {});

  let pushSentCount = 0;
  let totalDevices = 0;

  try {
    const pushRes = await sendPushToMembers(
      uniqueIds,
      {
        title,
        body,
        url: url || "/home",
        notificationId,
      },
      memberNamesMap
    );
    pushSentCount = pushRes.sent;
    totalDevices = pushRes.deviceCount;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[sendNotificationToMembers] notif "${notificationId}": ${records.length} in-app rows, ${pushSentCount} / ${totalDevices} push delivered`
      );
    }
  } catch (err) {
    console.error("[sendNotificationToMembers] push send threw:", err);
  }

  return {
    inAppCount: records.length,
    pushSentCount,
    totalDevices,
    notificationId,
  };
}

// Marks every currently-unread notification for this member as read.
export async function markAllNotificationsRead(memberRecordId: string): Promise<number> {
  const records = await getRecords(TABLES.NOTIFICATIONS);
  const unread = records.filter((r) => {
    const links = r.fields[NOTIFICATION_FIELDS.MEMBER];
    const linkedIds = Array.isArray(links) ? (links as string[]) : [];
    return linkedIds.includes(memberRecordId) && !r.fields[NOTIFICATION_FIELDS.READ];
  });

  // Update Airtable rows in parallel
  if (unread.length > 0) {
    await Promise.allSettled(
      unread.map((r) =>
        updateRecord(TABLES.NOTIFICATIONS, r.id, {
          [NOTIFICATION_FIELDS.READ]: true,
        })
      )
    );
  }

  // Invalidate Redis cache immediately
  await invalidateNotificationsCache(memberRecordId);

  return unread.length;
}

// Deletes a single notification for this member (or unlinks them if shared row)
export async function deleteNotification(
  notificationId: string,
  memberRecordId: string
): Promise<boolean> {
  const records = await getRecords(TABLES.NOTIFICATIONS);
  const target = records.find((r) => r.id === notificationId);
  if (!target) return false;

  const links = target.fields[NOTIFICATION_FIELDS.MEMBER];
  const linkedIds = Array.isArray(links) ? (links as string[]) : [];
  if (!linkedIds.includes(memberRecordId)) return false;

  if (linkedIds.length <= 1) {
    await deleteRecord(TABLES.NOTIFICATIONS, notificationId);
  } else {
    await updateRecord(TABLES.NOTIFICATIONS, notificationId, {
      [NOTIFICATION_FIELDS.MEMBER]: linkedIds.filter((id) => id !== memberRecordId),
    });
  }

  await invalidateNotificationsCache(memberRecordId);
  return true;
}

// Clears (deletes / unlinks) all notifications for this member
export async function clearAllNotifications(
  memberRecordId: string
): Promise<number> {
  const records = await getRecords(TABLES.NOTIFICATIONS);
  const memberNotifs = records.filter((r) => {
    const links = r.fields[NOTIFICATION_FIELDS.MEMBER];
    const linkedIds = Array.isArray(links) ? (links as string[]) : [];
    return linkedIds.includes(memberRecordId);
  });

  if (memberNotifs.length > 0) {
    await Promise.allSettled(
      memberNotifs.map(async (r) => {
        const links = r.fields[NOTIFICATION_FIELDS.MEMBER];
        const linkedIds = Array.isArray(links) ? (links as string[]) : [];
        if (linkedIds.length <= 1) {
          return deleteRecord(TABLES.NOTIFICATIONS, r.id);
        } else {
          return updateRecord(TABLES.NOTIFICATIONS, r.id, {
            [NOTIFICATION_FIELDS.MEMBER]: linkedIds.filter((id) => id !== memberRecordId),
          });
        }
      })
    );
  }

  await invalidateNotificationsCache(memberRecordId);
  return memberNotifs.length;
}
