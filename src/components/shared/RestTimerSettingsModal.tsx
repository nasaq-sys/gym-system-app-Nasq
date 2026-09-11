"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Timer,
  Bell,
  Layers,
  Sparkles,
  Volume2,
  Vibrate,
  EyeOff,
  Play,
  ExternalLink,
  ShieldAlert,
  User,
  Scale,
  CreditCard,
} from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { useWorkoutTimer } from "@/lib/WorkoutTimerProvider";
import { NativeTimerBridge } from "@/lib/nativeTimerBridge";
import { RestTimerSettings, DEFAULT_REST_TIMER_SETTINGS } from "@/lib/workoutTimerEngine";
import { toast } from "sonner";

interface RestTimerSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RestTimerSettingsModal({
  open,
  onOpenChange,
}: RestTimerSettingsModalProps) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const { startRestTimer } = useWorkoutTimer();

  const [settings, setSettings] = useState<RestTimerSettings>(DEFAULT_REST_TIMER_SETTINGS);
  const [platform, setPlatform] = useState<"android" | "ios" | "web">("web");
  const [hasOverlayPermission, setHasOverlayPermission] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate settings when modal opens */
  useEffect(() => {
    if (open) {
      const currentSettings = NativeTimerBridge.loadSavedSettings();
      setSettings(currentSettings);
      setPlatform(NativeTimerBridge.getPlatform());

      if (NativeTimerBridge.getPlatform() === "android") {
        NativeTimerBridge.checkOverlayPermission().then(setHasOverlayPermission);
      }
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleToggle = (key: keyof RestTimerSettings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    NativeTimerBridge.syncSettings(updated);
  };

  const handleRequestOverlay = async () => {
    const granted = await NativeTimerBridge.requestOverlayPermission();
    setHasOverlayPermission(granted);
    if (granted) {
      handleToggle("floatingOverlayEnabled", true);
      toast.success(isAr ? "تم تفعيل إذن الظهور فوق التطبيقات بنجاح" : "Overlay permission granted");
    } else {
      toast.info(isAr ? "يرجى تفعيل الإذن من إعدادات النظام" : "Please enable permission in Android settings");
    }
  };

  const handleTestTimer = () => {
    startRestTimer(10, isAr ? "تمرين تجريبي (10 ثوانٍ)" : "Test Exercise (10s)");
    toast.success(t("restTimerSettings.testTimerStarted"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5 bg-card border-border/80 text-foreground">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <Timer className="w-4 h-4" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              {t("restTimerSettings.title")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-foreground/70">
            {t("restTimerSettings.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* 1. Live Countdown Notification */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {t("restTimerSettings.persistentNotification")}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {t("restTimerSettings.persistentNotificationDesc")}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.persistentNotificationEnabled}
              onCheckedChange={(val) => handleToggle("persistentNotificationEnabled", val)}
            />
          </div>

          {/* 2. Floating Timer Over Apps (Android Only or System Overlay feature) */}
          {(platform === "android" || platform === "web") && (
            <div className="p-3 rounded-xl bg-card-hover border border-border/50 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>{t("restTimerSettings.floatingOverlay")}</span>
                      {hasOverlayPermission && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 text-3xs font-semibold border border-emerald-500/30">
                          {t("restTimerSettings.permissionGranted")}
                        </span>
                      )}
                    </p>
                    <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                      {t("restTimerSettings.floatingOverlayDesc")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.floatingOverlayEnabled && (platform !== "android" || hasOverlayPermission)}
                  onCheckedChange={(val) => {
                    if (val && platform === "android" && !hasOverlayPermission) {
                      handleRequestOverlay();
                    } else {
                      handleToggle("floatingOverlayEnabled", val);
                    }
                  }}
                />
              </div>

              {/* Explain Permission if not yet granted on Android */}
              {platform === "android" && !hasOverlayPermission && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-3xs text-amber-300">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("restTimerSettings.floatingOverlayPermissionNote")}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRequestOverlay}
                    className="h-7 text-3xs px-2.5 font-bold border-amber-500/40 hover:bg-amber-500/20"
                  >
                    <ExternalLink className="w-3 h-3 me-1" />
                    {t("restTimerSettings.grantPermission")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 3. iOS Live Activity (iOS Only) */}
          {(platform === "ios" || platform === "web") && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">
                    {t("restTimerSettings.liveActivity")}
                  </p>
                  <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                    {t("restTimerSettings.liveActivityDesc")}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.liveActivityEnabled}
                onCheckedChange={(val) => handleToggle("liveActivityEnabled", val)}
              />
            </div>
          )}

          {/* 4. Sound Alerts */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {t("restTimerSettings.sound")}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {t("restTimerSettings.soundDesc")}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(val) => handleToggle("soundEnabled", val)}
            />
          </div>

          {/* 5. Vibration */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <Vibrate className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {t("restTimerSettings.vibration")}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {t("restTimerSettings.vibrationDesc")}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.vibrationEnabled}
              onCheckedChange={(val) => handleToggle("vibrationEnabled", val)}
            />
          </div>

          {/* 6. Privacy - Hide Exercise Name */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <EyeOff className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إخفاء اسم التمرين في الويدجت والإشعارات" : "Hide Exercise Name"}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {isAr ? "عرض 'تمرين نشط' بدلاً من اسم التمرين لحماية الخصوصية" : "Show generic label instead of specific exercise name"}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.hideExerciseName}
              onCheckedChange={(val) => handleToggle("hideExerciseName", val)}
            />
          </div>

          {/* 7. Privacy - Hide Member Name */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إخفاء اسم العضو في الويدجت" : "Hide Member Name"}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {isAr ? "إخفاء اسمك وصورتك الشخصية من الشاشة الرئيسية وشاشة القفل" : "Hide your name and avatar from widgets and lock screen"}
                </p>
              </div>
            </div>
            <Switch
              checked={Boolean(settings.hideMemberName)}
              onCheckedChange={(val) => handleToggle("hideMemberName", val)}
            />
          </div>

          {/* 8. Privacy - Hide Body Measurements */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إخفاء قياسات الجسم (الوزن والطول)" : "Hide Body Measurements"}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {isAr ? "إخفاء الوزن والطول من بطاقات الويدجت العامة" : "Hide weight and height from home screen widget"}
                </p>
              </div>
            </div>
            <Switch
              checked={Boolean(settings.hideBodyMeasurements)}
              onCheckedChange={(val) => handleToggle("hideBodyMeasurements", val)}
            />
          </div>

          {/* 9. Privacy - Hide Subscription Details */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-card-hover border border-border/50 gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "إخفاء تفاصيل الاشتراك" : "Hide Subscription Details"}
                </p>
                <p className="text-3xs text-foreground/70 mt-0.5 leading-relaxed">
                  {isAr ? "إخفاء عدد الأيام المتبقية وحالة الاشتراك من الشاشة الرئيسية" : "Hide remaining days and status from home screen"}
                </p>
              </div>
            </div>
            <Switch
              checked={Boolean(settings.hideSubscriptionDetails)}
              onCheckedChange={(val) => handleToggle("hideSubscriptionDetails", val)}
            />
          </div>
        </div>

        {/* Action Buttons: Test Timer & Close */}
        <div className="pt-2 flex items-center gap-2">
          <Button
            type="button"
            onClick={handleTestTimer}
            className="flex-1 h-9 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm shadow-primary/20 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{t("restTimerSettings.testTimer")}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-xl text-xs font-bold cursor-pointer"
          >
            {t("restTimerSettings.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
