"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  Smartphone,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Monitor,
  Tablet,
  ShieldCheck,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import {
  isPushSupported,
  getExistingPushSubscription,
  subscribeToPush,
  resyncPushSubscription,
  getDeviceMetadata,
} from "@/lib/pushClient";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

interface DeviceItem {
  platform: "iOS" | "Android" | "Desktop" | "Tablet" | "Unknown";
  provider: string;
  browser: string;
  deviceLabel: string;
  endpointHostname: string;
  endpointFingerprint: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastSuccessfulPush?: string;
  lastFailure?: string;
  lastFailureStatus?: number;
}

interface DevicePushResultUI {
  endpointHostname: string;
  endpointFingerprint: string;
  platform: string;
  provider: string;
  deviceLabel?: string;
  statusCode?: number;
  success: boolean;
  error?: string;
}

interface ServerPushStatus {
  authenticated: boolean;
  userId?: string;
  role?: string;
  activeCount: number;
  devices?: DeviceItem[];
  endpoints?: string[];
  hasSubscriptions?: boolean;
}

export default function NotificationsSettingsPage() {
  const { locale } = useI18n();
  const isAr = locale === "ar";

  const [permissionState, setPermissionState] = useState<PermissionState>("default");
  const [serverStatus, setServerStatus] = useState<ServerPushStatus | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
    devices?: DevicePushResultUI[];
  } | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [clientMetadata, setClientMetadata] = useState(getDeviceMetadata());

  const checkState = useCallback(async () => {
    setClientMetadata(getDeviceMetadata());

    if (!isPushSupported()) {
      setPermissionState("unsupported");
      return;
    }

    // Check standalone mode
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check permission
    setPermissionState(Notification.permission as PermissionState);

    // Check existing device subscription
    await getExistingPushSubscription();

    // Check server database status
    try {
      const res = await fetch("/api/push/status", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      checkState();
    });
  }, [checkState]);

  const enableNotifications = useCallback(async () => {
    setSubscribing(true);
    setTestResult(null);
    await subscribeToPush();
    await checkState();
    setSubscribing(false);
  }, [checkState]);

  const handleResync = useCallback(async () => {
    setResyncing(true);
    setTestResult(null);
    await resyncPushSubscription();
    await checkState();
    setResyncing(false);
  }, [checkState]);

  const sendTestNotification = useCallback(async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Nasaq Gym",
          body: "تم استلام الإشعار بنجاح! — Test notification received successfully!",
          url: "/notifications",
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          ok: true,
          text: isAr
            ? `✓ تم إرسال الإشعار بنجاح لجميع أجهزتك المسجلة (${data.sent} من ${data.subscriptionsFound})! أغلق التطبيق واقفل الشاشة للتجربة.`
            : `✓ Sent successfully to all your registered devices (${data.sent} of ${data.subscriptionsFound})! Close the app and lock your screen.`,
          devices: data.devices,
        });
      } else if (data.error === "no_subscriptions") {
        setTestResult({
          ok: false,
          text: isAr
            ? "لم يتم العثور على اشتراك مسجل في السيرفر — اضغط تفعيل الإشعارات أولاً."
            : "No device subscription registered on server — enable notifications first.",
        });
      } else {
        setTestResult({
          ok: false,
          text: data.message || (isAr ? "فشل إرسال الإشعار" : "Failed to send"),
          devices: data.devices,
        });
      }
    } catch {
      setTestResult({
        ok: false,
        text: isAr ? "تعذر الاتصال بالسيرفر — حاول ثانية" : "Connection failed — try again",
      });
    } finally {
      setTestSending(false);
      checkState();
    }
  }, [isAr, checkState]);

  const permissionInfo = (() => {
    switch (permissionState) {
      case "granted":
        return {
          icon: CheckCircle2,
          color: "text-success",
          bg: "bg-success/10",
          label: isAr ? "مُفعّلة" : "Enabled",
          description: isAr
            ? "الإشعارات مُفعّلة على هذا الجهاز — ستصلك حتى لو التطبيق مُغلق والشاشة مقفلة."
            : "Notifications are enabled on this device — you'll receive them even when closed and locked.",
        };
      case "denied":
        return {
          icon: XCircle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          label: isAr ? "محظورة" : "Blocked",
          description: isAr
            ? "تم حظر الإشعارات من إعدادات المتصفح/الجهاز."
            : "Notifications are blocked in your browser/device settings.",
        };
      case "unsupported":
        return {
          icon: AlertTriangle,
          color: "text-warning",
          bg: "bg-warning/10",
          label: isAr ? "غير مدعومة" : "Not Supported",
          description: isAr
            ? "متصفحك الحالي لا يدعم إشعارات الويب."
            : "Your current browser doesn't support web push notifications.",
        };
      default:
        return {
          icon: Bell,
          color: "text-foreground/70",
          bg: "bg-card-hover",
          label: isAr ? "غير مُفعّلة" : "Not Enabled",
          description: isAr
            ? "فعّل الإشعارات لتصلك تنبيهات الاشتراكات وتحديثات التمارين."
            : "Enable notifications to receive subscription and workout alerts.",
        };
    }
  })();

  const StatusIcon = permissionInfo.icon;

  const getPlatformIcon = (platform: string) => {
    if (platform === "iOS" || platform === "Android") return Smartphone;
    if (platform === "Tablet") return Tablet;
    return Monitor;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Desktop Hero Banner (>= lg) */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/25">
              <BellRing className="w-3.5 h-3.5" />
              {isAr ? "مركز الإشعارات والتنبيهات الفورية" : "Push Notification Center"}
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {isAr ? "مركز الإشعارات والأجهزة" : "Notifications & Devices"}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "إدارة إشعارات الأجهزة المسجلة، التحقق من تفعيل Web Push، واستلام تنبيهات الاشتراكات فوراً."
                : "Manage registered devices and verify Web Push alerts delivery."}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Header (< lg) */}
      <div className="block lg:hidden">
        <h1 className="text-2xl font-bold text-foreground">
          {isAr ? "الإشعارات" : "Notifications"}
        </h1>
        <p className="text-sm text-foreground/70 mt-1">
          {isAr
            ? "إدارة إشعارات الأجهزة المسجلة والتحقق من حالة وصول Web Push."
            : "Manage registered device notifications and verify Web Push delivery."}
        </p>
      </div>

      {/* Permission Status Card */}
      <Card>
        <CardHeader title={isAr ? "حالة الإشعارات بهذا الجهاز" : "This Device Status"} />
        <CardContent>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
              permissionInfo.bg
            )}
          >
            <StatusIcon className={cn("w-6 h-6", permissionInfo.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={cn("text-sm font-bold", permissionInfo.color)}>
                {permissionInfo.label}
              </p>
              <span className="text-3xs px-2 py-0.5 rounded-full bg-card-hover text-foreground/70 font-medium">
                {clientMetadata.deviceLabel}
              </span>
            </div>
            <p className="text-xs text-foreground/70 mt-1 leading-relaxed">
              {permissionInfo.description}
            </p>
          </div>
        </div>

        {/* Enable button — only for "default" state */}
        {permissionState === "default" && (
          <button
            onClick={enableNotifications}
            disabled={subscribing}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-accent text-accent-foreground text-sm font-bold hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <BellRing className="w-4 h-4" />
            {subscribing
              ? isAr
                ? "جاري التفعيل..."
                : "Enabling..."
              : isAr
                ? "تفعيل الإشعارات الآن"
                : "Enable Notifications Now"}
          </button>
        )}

        {/* Denied — how to re-enable */}
        {permissionState === "denied" && (
          <div className="mt-4 p-3 bg-card-hover rounded-xl">
            <p className="text-xs font-bold text-foreground mb-1.5">
              {isAr ? "كيف تعيد تفعيل الإشعارات؟" : "How to re-enable notifications?"}
            </p>
            <ol className="text-2xs text-foreground/70 space-y-1 list-decimal ps-4 leading-relaxed">
              {isAr ? (
                <>
                  <li>افتح إعدادات الهاتف ➔ ابحث عن المتصفح أو تطبيق Nasaq Gym</li>
                  <li>اختر &ldquo;الإشعارات&rdquo; وفعل &ldquo;السماح بالإشعارات&rdquo;</li>
                  <li>أعد فتح التطبيق</li>
                </>
              ) : (
                <>
                  <li>Open device Settings ➔ Browser or Nasaq Gym app</li>
                  <li>Select &ldquo;Notifications&rdquo; and toggle &ldquo;Allow Notifications&rdquo;</li>
                  <li>Reopen the app</li>
                </>
              )}
            </ol>
          </div>
        )}
        </CardContent>
      </Card>

      {/* Multi-Device Registered Devices Card */}
      {permissionState === "granted" && (
        <Card>
          <CardContent>
          <div className="flex items-center justify-between mb-3">
            <CardHeader title={isAr ? "جميع أجهزتك المسجلة بالإشعارات" : "All Your Registered Devices"} />
            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary text-primary-foreground">
              {serverStatus?.activeCount ?? 0} {isAr ? "أجهزة" : "devices"}
            </span>
          </div>

          <div className="space-y-2.5">
            {serverStatus?.devices && serverStatus.devices.length > 0 ? (
              serverStatus.devices.map((d, i) => {
                const DevIcon = getPlatformIcon(d.platform);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-accent shrink-0 border border-border">
                        <DevIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {d.deviceLabel || d.platform}
                        </p>
                        <p className="text-3xs text-foreground/70 font-mono truncate">
                          {d.endpointFingerprint} • {d.provider}
                        </p>
                      </div>
                    </div>
                    <span className="text-3xs font-bold px-2 py-1 rounded bg-success/15 text-success shrink-0">
                      {isAr ? "نشط ✓" : "Active ✓"}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="p-3 bg-card-hover rounded-xl text-xs text-foreground/70">
                {isAr ? "جاري جلب قائمة الأجهزة..." : "Loading registered devices..."}
              </div>
            )}

            {/* Resync current device */}
            <button
              onClick={handleResync}
              disabled={resyncing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card-hover hover:bg-accent hover:text-accent-foreground border border-border text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", resyncing && "animate-spin")} />
              {resyncing
                ? isAr
                  ? "جاري المزامنة مع السيرفر..."
                  : "Syncing..."
                : isAr
                  ? "إعادة مزامنة هذا الجهاز مع السيرفر"
                  : "Resync Current Device with Server"}
            </button>
          </div>
          </CardContent>
        </Card>
      )}

      {/* Android Notification Health Check Guide */}
      {clientMetadata.platform === "Android" && permissionState === "granted" && (
        <Card>
          <CardContent className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-bold text-foreground">
                {isAr ? "نصائح مهمة لمستخدمي أندرويد (Android)" : "Important Tips for Android Users"}
              </p>
              <p className="text-xs text-foreground/70 leading-relaxed">
                {isAr
                  ? "لضمان وصول الإشعارات فوراً أثناء قفل الشاشة وإغلاق التطبيق:"
                  : "To guarantee prompt push delivery when closed and locked:"}
              </p>
              <ul className="text-xs text-foreground/70 space-y-1 list-disc ps-4 leading-relaxed">
                <li>
                  {isAr
                    ? "اضبط البطارية على «غير مقيد / Unrestricted» في إعدادات التطبيق أو المتصفح."
                    : "Set Battery usage to «Unrestricted» in Chrome/Nasaq Gym app info."}
                </li>
                <li>
                  {isAr
                    ? "تأكد من تفعيل «بيانات الخلفية / Allow background data»."
                    : "Ensure «Allow background data usage» is enabled."}
                </li>
                <li>
                  {isAr
                    ? "تأكد من عدم تفعيل وضع «توفير الطاقة الشديد»."
                    : "Disable aggressive Power Saving modes for the browser/PWA."}
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Standalone window hint for iOS and mobile browsers */}
      {!isStandalone && clientMetadata.platform === "iOS" && (
        <Card>
          <CardContent className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">
                {isAr ? "أضف التطبيق إلى الشاشة الرئيسية" : "Add App to Home Screen"}
              </p>
              <p className="text-xs text-foreground/70 mt-1 leading-relaxed">
                {isAr
                  ? "لتلقي إشعارات الويب على iPhone / iPad، يجب تثبيت التطبيق وفتحه من الشاشة الرئيسية (الوضع المستقل)."
                  : "To receive Web Push notifications on iPhone / iPad, install and open from your Home Screen (standalone mode)."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real Server-Side Test Push to All Devices */}
      {permissionState === "granted" && (
        <Card>
          <CardHeader title={isAr ? "اختبار إشعار حقيقي لجميع أجهزتك" : "Multi-Device Test Push"} />
          <CardContent>
          <p className="text-xs text-foreground/70 mb-3 leading-relaxed">
            {isAr
              ? "اضغط الزر لإرسال إشعار فوري من السيرفر يصل لجميع أجهزتك المسجلة (iPhone, Android, Desktop) معاً. أغلق التطبيق واقفل الشاشة للتجربة."
              : "Sends a real Web Push from the server fanning out to ALL of your registered devices (iPhone, Android, Desktop) at once."}
          </p>
          <button
            onClick={sendTestNotification}
            disabled={testSending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-accent text-accent-foreground text-sm font-bold hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-primary/20"
          >
            <Send className="w-4 h-4" />
            {testSending
              ? isAr
                ? "جاري الإرسال لجميع الأجهزة..."
                : "Fanning out to all devices..."
              : isAr
                ? "إرسال إشعار تجريبي لكافة الأجهزة الآن"
                : "Send Test Push to All Devices"}
          </button>

          {testResult && (
            <div className="mt-3 space-y-2">
              <p
                className={cn(
                  "text-xs font-bold",
                  testResult.ok ? "text-success" : "text-destructive"
                )}
              >
                {testResult.text}
              </p>

              {testResult.devices && testResult.devices.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-2xs font-bold text-foreground">
                    {isAr ? "تقرير الإرسال لكل جهاز:" : "Per-Device Send Report:"}
                  </p>
                  {testResult.devices.map((d, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-card-hover rounded-xl border border-border flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {d.success ? (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">
                            {d.deviceLabel || d.platform} ({d.provider})
                          </p>
                          <p className="text-3xs text-foreground/70 font-mono truncate">
                            {d.endpointFingerprint}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-3xs font-bold px-2 py-0.5 rounded shrink-0",
                          d.success ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                        )}
                      >
                        {d.success ? `HTTP ${d.statusCode || 201}` : d.error || "Failed"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </CardContent>
        </Card>
      )}

      {/* About Push Notifications */}
      <Card>
        <CardHeader title={isAr ? "عن الإشعارات متعددة الأجهزة" : "About Multi-Device Notifications"} />
        <CardContent>
        <div className="space-y-2">
          {[
            {
              icon: BellRing,
              text: isAr
                ? "يصل الإشعار لجميع هواتفك وأجهزتك المسجلة بنفس الحساب فوراً."
                : "Notifications deliver to all your active phones and devices simultaneously.",
            },
            {
              icon: Smartphone,
              text: isAr
                ? "تعمل حتى عندما يكون التطبيق مُغلقاً تماماً أو شاشة الهاتف مقفلة."
                : "Works even when the app is completely closed or screen is locked.",
            },
            {
              icon: BellOff,
              text: isAr
                ? "يمكنك إدارة أو إلغاء الإشعارات من إعدادات كل جهاز على حدة."
                : "You can manage notification permissions independently on each device.",
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5">
              <item.icon className="w-4 h-4 text-foreground/70 mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/70 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
