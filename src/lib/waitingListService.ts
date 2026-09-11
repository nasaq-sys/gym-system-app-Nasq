import { getRecords, deleteRecord, updateRecord } from "@/lib/airtable";
import {
  TABLES,
  WAITING_LIST_FIELDS,
  CLASS_FIELDS,
  EVENT_FIELDS,
  FACILITY_BOOKING_FIELDS,
} from "@/lib/constants";
import { sendNotificationToMembers } from "@/lib/notifications";
import { invalidateEventsCache } from "@/lib/cacheService";

/**
 * Auto-promotes eligible waiting list members for a Class when spots become available
 * (due to cancellation or capacity expansion), deletes their queue record,
 * updates the Class record in Airtable, and sends push & in-app notifications.
 */
export async function promoteClassWaitingList({
  classId,
  capacity,
  currentMembers,
  className,
}: {
  classId: string;
  capacity: number;
  currentMembers: string[];
  className?: string;
}): Promise<{ updatedMembers: string[]; promotedCount: number; promotedIds: string[] }> {
  if (capacity <= 0 || currentMembers.length >= capacity) {
    return { updatedMembers: currentMembers, promotedCount: 0, promotedIds: [] };
  }

  const spotsAvailable = capacity - currentMembers.length;
  const waitRecords = await getRecords(TABLES.WAITING_LIST);

  // Filter queue entries for this class
  const classWaitEntries = waitRecords
    .filter((w) => {
      const classIds = (w.fields[WAITING_LIST_FIELDS.CLASS] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      const status = w.fields[WAITING_LIST_FIELDS.STATUS];
      return (
        (classIds.includes(classId) || notes === classId) &&
        status === "بالانتظار"
      );
    })
    .sort((a, b) => {
      const dateA = String(a.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || a.createdTime || "");
      const dateB = String(b.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || b.createdTime || "");
      return dateA.localeCompare(dateB);
    });

  const promotedIds: string[] = [];
  const entriesToDelete: string[] = [];
  const nextMembers = [...currentMembers];

  for (const entry of classWaitEntries) {
    if (promotedIds.length >= spotsAvailable) break;
    const mIds = (entry.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
    const candidateId = mIds[0];
    if (candidateId && !nextMembers.includes(candidateId)) {
      nextMembers.push(candidateId);
      promotedIds.push(candidateId);
      entriesToDelete.push(entry.id);
    }
  }

  if (promotedIds.length > 0) {
    // Delete waiting list records
    await Promise.allSettled(entriesToDelete.map((id) => deleteRecord(TABLES.WAITING_LIST, id)));

    // Update class members in Airtable
    await updateRecord(TABLES.CLASSES, classId, {
      [CLASS_FIELDS.MEMBERS]: nextMembers,
    });

    // Notify promoted members
    const displayName = className || "الكلاس";
    for (const memberId of promotedIds) {
      sendNotificationToMembers(
        [memberId],
        "🎉 تم تأكيد انضمامك للكلاس!",
        `مبروك! تم نقلك تلقائياً من قائمة الانتظار وتأكيد انضمامك إلى كلاس "${displayName}".`,
        "/events"
      ).catch((err) => console.error("[Class Auto-Promote Notification Error]:", err));
    }

    await invalidateEventsCache();
  }

  return { updatedMembers: nextMembers, promotedCount: promotedIds.length, promotedIds };
}

/**
 * Auto-promotes eligible waiting list members for an Event when spots become available
 * (due to cancellation or capacity expansion), deletes their queue record,
 * updates the Event record in Airtable, and sends push & in-app notifications.
 */
export async function promoteEventWaitingList({
  eventId,
  maxParticipants,
  currentRegistrants,
  eventName,
}: {
  eventId: string;
  maxParticipants: number;
  currentRegistrants: string[];
  eventName?: string;
}): Promise<{ updatedRegistrants: string[]; promotedCount: number; promotedIds: string[] }> {
  if (maxParticipants <= 0 || currentRegistrants.length >= maxParticipants) {
    return { updatedRegistrants: currentRegistrants, promotedCount: 0, promotedIds: [] };
  }

  const spotsAvailable = maxParticipants - currentRegistrants.length;
  const waitRecords = await getRecords(TABLES.WAITING_LIST);

  const eventWaitEntries = waitRecords
    .filter((w) => {
      const eventIds = (w.fields[WAITING_LIST_FIELDS.EVENT] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      const status = w.fields[WAITING_LIST_FIELDS.STATUS];
      return (
        (eventIds.includes(eventId) || notes === eventId) &&
        status === "بالانتظار"
      );
    })
    .sort((a, b) => {
      const dateA = String(a.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || a.createdTime || "");
      const dateB = String(b.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || b.createdTime || "");
      return dateA.localeCompare(dateB);
    });

  const promotedIds: string[] = [];
  const entriesToDelete: string[] = [];
  const nextRegistrants = [...currentRegistrants];

  for (const entry of eventWaitEntries) {
    if (promotedIds.length >= spotsAvailable) break;
    const mIds = (entry.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
    const candidateId = mIds[0];
    if (candidateId && !nextRegistrants.includes(candidateId)) {
      nextRegistrants.push(candidateId);
      promotedIds.push(candidateId);
      entriesToDelete.push(entry.id);
    }
  }

  if (promotedIds.length > 0) {
    await Promise.allSettled(entriesToDelete.map((id) => deleteRecord(TABLES.WAITING_LIST, id)));

    await updateRecord(TABLES.EVENTS, eventId, {
      [EVENT_FIELDS.REGISTRANTS]: nextRegistrants,
      [EVENT_FIELDS.PARTICIPANT_COUNT]: nextRegistrants.length,
    });

    const displayName = eventName || "الفعالية";
    for (const memberId of promotedIds) {
      sendNotificationToMembers(
        [memberId],
        "🎉 تم تأكيد مشاركتك في الفعالية!",
        `مبروك! تم نقلك تلقائياً من قائمة الانتظار وتأكيد تسجيلك في فعالية "${displayName}".`,
        "/events"
      ).catch((err) => console.error("[Event Auto-Promote Notification Error]:", err));
    }

    await invalidateEventsCache();
  }

  return { updatedRegistrants: nextRegistrants, promotedCount: promotedIds.length, promotedIds };
}

/**
 * Auto-promotes eligible waiting list members for a Facility Slot when spots become available
 * (due to cancellation or capacity expansion), deletes their queue record,
 * updates the Facility Booking record in Airtable, and sends push & in-app notifications.
 */
export async function promoteFacilityWaitingList({
  bookingId,
  facilityId,
  capacity,
  currentMembers,
  facilityName,
  period,
}: {
  bookingId: string;
  facilityId?: string;
  capacity: number;
  currentMembers: string[];
  facilityName?: string;
  period?: string;
}): Promise<{ updatedMembers: string[]; promotedCount: number; promotedIds: string[] }> {
  if (capacity <= 0 || currentMembers.length >= capacity) {
    return { updatedMembers: currentMembers, promotedCount: 0, promotedIds: [] };
  }

  const spotsAvailable = capacity - currentMembers.length;
  const waitRecords = await getRecords(TABLES.WAITING_LIST);

  const slotWaitEntries = waitRecords
    .filter((w) => {
      const facIds = (w.fields[WAITING_LIST_FIELDS.FACILITY] as string[] | undefined) || [];
      const notes = (w.fields[WAITING_LIST_FIELDS.NOTES] as string) || "";
      const status = w.fields[WAITING_LIST_FIELDS.STATUS];
      const matchSlot = notes === bookingId;
      const matchFac = facilityId ? facIds.includes(facilityId) : false;
      return (matchSlot || matchFac) && status === "بالانتظار";
    })
    .sort((a, b) => {
      const dateA = String(a.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || a.createdTime || "");
      const dateB = String(b.fields[WAITING_LIST_FIELDS.REQUEST_DATE] || b.createdTime || "");
      return dateA.localeCompare(dateB);
    });

  const promotedIds: string[] = [];
  const entriesToDelete: string[] = [];
  const nextMembers = [...currentMembers];

  for (const entry of slotWaitEntries) {
    if (promotedIds.length >= spotsAvailable) break;
    const mIds = (entry.fields[WAITING_LIST_FIELDS.MEMBER] as string[] | undefined) || [];
    const candidateId = mIds[0];
    if (candidateId && !nextMembers.includes(candidateId)) {
      nextMembers.push(candidateId);
      promotedIds.push(candidateId);
      entriesToDelete.push(entry.id);
    }
  }

  if (promotedIds.length > 0) {
    await Promise.allSettled(entriesToDelete.map((id) => deleteRecord(TABLES.WAITING_LIST, id)));

    await updateRecord(TABLES.FACILITY_BOOKINGS, bookingId, {
      [FACILITY_BOOKING_FIELDS.MEMBER]: nextMembers,
    });

    const displayName = facilityName || "المرفق";
    const periodLabel = period ? ` (${period})` : "";
    for (const memberId of promotedIds) {
      sendNotificationToMembers(
        [memberId],
        "🎉 تم تأكيد حجز المرفق!",
        `مبروك! تم نقلك تلقائياً من قائمة الانتظار وتأكيد حجزك في ${displayName}${periodLabel}.`,
        "/events"
      ).catch((err) => console.error("[Facility Auto-Promote Notification Error]:", err));
    }

    await invalidateEventsCache();
  }

  return { updatedMembers: nextMembers, promotedCount: promotedIds.length, promotedIds };
}
