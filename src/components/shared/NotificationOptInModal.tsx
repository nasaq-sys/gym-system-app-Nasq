"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { isPushSupported, subscribeToPush } from "@/lib/pushClient";
import { isCurrentWindowStandalone } from "./InstallPrompt";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SESSION_DISMISS_KEY = "ultra_gym_notif_optin_dismissed_session";

export default function NotificationOptInModal() {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isPushSupported() || Notification.permission !== "default") {
      return;
    }

    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
        return;
      }
    } catch {}

    const isStandalone = isCurrentWindowStandalone();
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");

    if (isIOS && !isStandalone) {
      return;
    }

    let timer: number | undefined;

    const showModal = () => {
      const isSplashActive =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("gojim-splash-active");

      if (isSplashActive) {
        const observer = new MutationObserver(() => {
          if (!document.documentElement.classList.contains("gojim-splash-active")) {
            observer.disconnect();
            timer = window.setTimeout(() => setVisible(true), 800);
          }
        });
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
        return;
      }

      timer = window.setTimeout(() => setVisible(true), 1200);
    };

    showModal();

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleAllow = useCallback(async () => {
    setSubscribing(true);
    try {
      const result = await subscribeToPush();
      if (result) {
        try {
          sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
        } catch {}
      }
    } catch (err) {
      console.error("[NotificationOptInModal] Subscribe error:", err);
    } finally {
      setSubscribing(false);
      setVisible(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {}
  }, []);

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <BellRing className="w-6 h-6 animate-pulse" />
          </div>
          <DialogTitle className="text-lg sm:text-xl font-extrabold text-start">
            السماح بالإشعارات؟
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm leading-relaxed text-start text-foreground/70">
            فعّل الإشعارات لتصلك التنبيهات والتحديثات المهمة من Nasaq Gym أولاً بأول.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 p-3.5 bg-muted/50 border border-border rounded-xl text-xs text-foreground">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>تنبيهات الاشتراكات وتجديدها</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>مواعيد الحضور وتحديثات التمارين</span>
          </div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>العروض والفعاليات والرسائل المهمة</span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            type="button"
            onClick={handleAllow}
            disabled={subscribing}
            className="w-full"
          >
            <BellRing className="w-4 h-4" />
            <span>{subscribing ? "جاري التفعيل..." : "السماح بالإشعارات"}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleDismiss}
            disabled={subscribing}
            className="w-full text-xs text-foreground/70"
          >
            ليس الآن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
