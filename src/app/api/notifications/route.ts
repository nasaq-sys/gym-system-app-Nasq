import { NextResponse } from "next/server";
import { verifyApiRequest } from "@/lib/serverAuth";
import {
  getMemberNotifications,
  deleteNotification,
  clearAllNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";
import { updateRecord } from "@/lib/airtable";
import { TABLES, NOTIFICATION_FIELDS } from "@/lib/constants";
import { invalidateNotificationsCache } from "@/lib/cacheService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notifications = await getMemberNotifications(user.recordId);
    const unreadCount = notifications.filter((n) => !n.read).length;
    return NextResponse.json(
      { success: true, data: notifications, unreadCount },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Notifications fetch error:", error);
    return NextResponse.json(
      { message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const markAll = url.searchParams.get("markAll") === "true";
    const id = url.searchParams.get("id");

    if (markAll) {
      const count = await markAllNotificationsRead(user.recordId);
      return NextResponse.json({ success: true, count });
    }

    if (id) {
      await updateRecord(TABLES.NOTIFICATIONS, id, {
        [NOTIFICATION_FIELDS.READ]: true,
      });
      await invalidateNotificationsCache(user.recordId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "Missing id or markAll parameter" }, { status: 400 });
  } catch (error) {
    console.error("Patch notification error:", error);
    return NextResponse.json({ message: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await verifyApiRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.all === true) {
      const count = await clearAllNotifications(user.recordId);
      return NextResponse.json({ success: true, count, message: "Cleared all notifications" });
    }

    const id = body?.id || new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ message: "Notification ID is required" }, { status: 400 });
    }

    const ok = await deleteNotification(id, user.recordId);
    if (!ok) {
      return NextResponse.json({ message: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json(
      { message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}
