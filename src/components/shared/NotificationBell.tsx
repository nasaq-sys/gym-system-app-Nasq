"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CheckCheck,
  Megaphone,
  CreditCard,
  Calendar,
  Sparkles,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isPushSupported, subscribeToPush } from "@/lib/pushClient";

export interface MemberNotification {
  id: string;
  type: "announcement" | "subscription" | "booking" | "general" | "order";
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionUrl?: string;
  actionLabelAr?: string;
  actionLabelEn?: string;
  createdAt: string;
  isRead: boolean;
}

function timeAgo(dateIso: string, isAr: boolean): string {
  try {
    const diff = Math.max(0, Date.now() - new Date(dateIso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return isAr ? "الآن" : "Just now";
    if (min < 60) return isAr ? `منذ ${min} دقيقة` : `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return isAr ? `منذ ${hours} ساعة` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return isAr ? `منذ ${days} يوم` : `${days}d ago`;
    return new Date(dateIso).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function NotificationBell() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [enablingPush, setEnablingPush] = useState(false);

  const checkPushState = useCallback(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      await subscribeToPush();
      checkPushState();
    } finally {
      setEnablingPush(false);
    }
  };

  const fetchNotifications = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json?.data)) {
        const mapped: MemberNotification[] = json.data.map((item: any) => ({
          id: item.id,
          type: (item.type || "general") as MemberNotification["type"],
          titleAr: item.title || "",
          titleEn: item.title || "",
          bodyAr: item.body || "",
          bodyEn: item.body || "",
          actionUrl: item.url || item.actionUrl,
          createdAt: item.date || new Date().toISOString(),
          isRead: Boolean(item.read),
        }));
        setNotifications(mapped);
        setUnreadCount(typeof json.unreadCount === "number" ? json.unreadCount : mapped.filter((n) => !n.isRead).length);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    checkPushState();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
        checkPushState();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Real-time polling every 35s while app is actively open
    const interval = setInterval(fetchNotifications, 35000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications, checkPushState]);

  const markAsRead = async (id: string, actionUrl?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
      });
    } catch {}

    if (actionUrl) {
      setOpen(false);
      router.push(actionUrl);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/notifications?markAll=true", {
        method: "PATCH",
        credentials: "same-origin",
      });
    } catch {
      fetchNotifications();
    } finally {
      setMarkingAll(false);
    }
  };

  const getIcon = (type: MemberNotification["type"]) => {
    switch (type) {
      case "announcement":
        return <Megaphone className="w-4 h-4 text-primary" />;
      case "subscription":
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      case "booking":
        return <Calendar className="w-4 h-4 text-blue-400" />;
      case "order":
        return <ShoppingBag className="w-4 h-4 text-amber-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "relative rounded-xl cursor-pointer"
        )}
        aria-label={t("notifications.title")}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -end-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="w-(--available-width) max-w-[380px] p-0 overflow-hidden text-foreground"
        align="center"
        collisionPadding={16}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">
              {t("notifications.title")}
            </span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-3xs font-bold">
                {unreadCount} {t("notifications.new")}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              disabled={markingAll}
              className="text-xs h-7 text-primary hover:text-primary gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{t("notifications.markAllRead")}</span>
            </Button>
          )}
        </div>

        {/* Opt-in banner if push not granted */}
        {pushPermission === "default" && (
          <div className="p-2.5 mx-3 mt-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-primary font-bold text-2xs sm:text-xs">
              <BellRing className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span>{isAr ? "تفعيل إشعارات الهاتف" : "Enable push alerts"}</span>
            </div>
            <Button
              size="sm"
              className="h-6 text-3xs px-2.5"
              onClick={handleEnablePush}
              disabled={enablingPush}
            >
              {enablingPush ? (isAr ? "جاري..." : "Enabling...") : (isAr ? "تفعيل" : "Enable")}
            </Button>
          </div>
        )}

        {/* List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60">
          {notifications.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-2.5 text-foreground/70">
                <Bell className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-xs font-semibold text-foreground/70">
                {t("notifications.empty")}
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const title = isAr ? n.titleAr : n.titleEn;
              const body = isAr ? n.bodyAr : n.bodyEn;
              const actionLabel = isAr ? n.actionLabelAr : n.actionLabelEn;

              return (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id, n.actionUrl)}
                  className={cn(
                    "p-3.5 transition-colors flex items-start gap-3 cursor-pointer",
                    n.isRead
                      ? "bg-transparent hover:bg-muted/40 opacity-80"
                      : "bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <div className="p-2 rounded-xl bg-muted/50 shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-xs font-bold truncate", n.isRead ? "text-foreground" : "text-foreground")}>
                        {title}
                      </p>
                      <span className="text-3xs text-foreground/70 shrink-0 font-medium">
                        {timeAgo(n.createdAt, isAr)}
                      </span>
                    </div>

                    <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2">
                      {body}
                    </p>

                    {n.actionUrl && (
                      <div className="pt-1 flex items-center gap-1 text-2xs font-bold text-primary">
                        <span>{actionLabel || t("notifications.viewDetails")}</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 self-center" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
