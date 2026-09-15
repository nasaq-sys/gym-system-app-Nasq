"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import {
  User,
  Globe,
  AlertCircle,
  CreditCard,
  Calendar,
  Sparkles,
  Snowflake,
  HeartPulse,
  Award,
  Radio,
  Sun,
  LogOut,
  Loader2,
  Timer,
  ChevronRight,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import ThemeSwitch from "@/components/shared/ThemeSwitch";
import RenewSubscriptionModal from "@/components/shared/RenewSubscriptionModal";
import { resolveSubscriptionPeriod } from "@/lib/subscriptionUtils";
import { useWorkoutTimer } from "@/lib/WorkoutTimerProvider";
import { useGymWhatsApp } from "@/hooks/useGymWhatsApp";
import { WhatsAppIcon } from "@/components/shared/SocialIcons";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";


interface ProfileItem {
  key: string;
  type: "text" | "number" | "date" | "datetime" | "bool" | "url";
  group: string;
  labelAr: string;
  labelEn: string;
  value: unknown;
  valueAr: string;
  valueEn: string;
}

interface MemberData {
  recordId?: string;
  memberId?: string;
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  age?: number;
  dob?: string;
  weight?: number | string;
  height?: number | string;
  bmi?: number | string;
  balance?: number | string;
  health?: string;
  emergency?: string;
  active?: boolean | string;
  nfc?: string;
  joinDate?: string;
  rank?: string;
  gateMessage?: string;
  subscriptionStatus?: string;
  planType?: string;
  trainerName?: string;
  daysRemaining?: number | string;
  commitmentStatus?: string;
  totalSessions?: number | string;
  subStartDate?: string;
  subEndDate?: string;
  subStatus?: string;
  freezeDays?: number | string;
  fullProfile?: ProfileItem[];
}

function initials(name?: string): string {
  if (!name) return "UG";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function getBmiCategory(bmiVal: number, isAr: boolean): { text: string; color: string } {
  if (bmiVal < 18.5) {
    return { text: isAr ? "نقص في الوزن" : "Underweight", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" };
  }
  if (bmiVal < 25) {
    return { text: isAr ? "وزن مثالي / صحي" : "Normal Weight", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
  }
  if (bmiVal < 30) {
    return { text: isAr ? "زيادة في الوزن" : "Overweight", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
  }
  return { text: isAr ? "سمنة" : "Obese", color: "text-red-400 bg-red-500/10 border-red-500/20" };
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const { cleanupOnLogout } = useWorkoutTimer();
  const { isLinked: isWaLinked, openWhatsApp, displayPhone: waDisplayPhone } = useGymWhatsApp();
  const [member, setMember] = useState<MemberData | null>(() => getClientCachedData<MemberData>("/api/members"));
  const [loading, setLoading] = useState(() => !getClientCachedData("/api/members"));
  const [loggingOut, setLoggingOut] = useState(false);
  const [renewModalOpen, setRenewModalOpen] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    cleanupOnLogout();
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };


  const fetchProfile = useCallback(() => {
    clientFetch<MemberData>("/api/members", undefined, { ttlMs: 60000 })
      .then((res) => {
        const data = (res as any)?.data ?? res;
        if (data) setMember(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const parsedBmi = useMemo(() => {
    const raw = member?.bmi;
    if (!raw) return null;
    const n = Number(String(raw).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [member?.bmi]);

  const subPeriod = useMemo(() => resolveSubscriptionPeriod(member), [member]);

  const daysRemainingNum = useMemo(() => {
    if (subPeriod.daysLeft != null) return subPeriod.daysLeft;
    if (member?.daysRemaining == null) return null;
    const n = Number(member.daysRemaining);
    return Number.isFinite(n) ? n : null;
  }, [subPeriod, member]);

  const isSubActive = useMemo(() => {
    if (subPeriod.isExpired) return false;
    const status = (member?.subStatus || member?.subscriptionStatus || "").toLowerCase();
    if (status.includes("منتهي") || status.includes("expired") || status.includes("ملغي")) return false;
    if (daysRemainingNum != null && daysRemainingNum <= 0) return false;
    return true;
  }, [subPeriod, member, daysRemainingNum]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const notSet = t("profile.notSet");

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] md:pb-16">
      {/* ── 1. VIP DIGITAL PASS HERO CARD ── */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 space-y-6">
          {/* Top Bar inside Card */}
          <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-black text-xs">
                NG
              </div>
              <span className="font-extrabold text-xs uppercase tracking-wider text-foreground">
                Nasaq Gym Pass
              </span>
            </div>
            <div className="flex items-center gap-2">
              {member?.rank && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Award className="w-3.5 h-3.5" />
                  {member.rank}
                </span>
              )}
              {member?.nfc && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-semibold bg-card-hover border border-border text-foreground/70">
                  <Radio className="w-3 h-3 text-primary animate-pulse" />
                  NFC
                </span>
              )}
            </div>
          </div>

          {/* Member Main Identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-sky-400 border-2 border-sky-300/80 flex items-center justify-center shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20 shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] tracking-wider">
                  {initials(member?.name)}
                </span>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-foreground">
                  {member?.name || t("profile.title")}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/70">
                  <span className="font-mono font-semibold text-foreground/80 bg-background/60 px-2 py-0.5 rounded-md border border-border/60">
                    #{member?.memberId || member?.recordId || "—"}
                  </span>
                  {member?.email && <span>{member.email}</span>}
                  {member?.phone && (
                    <span className="dir-ltr font-mono font-medium text-foreground/80 bg-background/60 px-2 py-0.5 rounded-md border border-border/60" dir="ltr">
                      {member.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar (Complete Personal & Membership Info without duplication) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {/* 1. الباقة / الخطة */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-accent" />
                {t("profile.membershipCard.plan")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.planType || member?.subscriptionStatus || "عضوية قياسية"}
              </p>
            </div>

            {/* 2. تاريخ الانضمام */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                {t("profile.joinDate")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.joinDate ? formatLongDate(member.joinDate, locale) : notSet}
              </p>
            </div>

            {/* 3. المدرب المسؤول */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-accent" />
                {t("profile.assignedTrainer")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.trainerName || notSet}
              </p>
            </div>

            {/* 4. الجنس */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-accent" />
                {t("profile.gender")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.gender ? (isAr ? (member.gender === "ذكر" ? "ذكر" : "أنثى") : (member.gender === "ذكر" ? "Male" : "Female")) : notSet}
              </p>
            </div>

            {/* 5. العمر */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                {t("profile.age")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.age ? `${member.age} ${isAr ? "سنة" : "yrs"}` : notSet}
              </p>
            </div>

            {/* 6. تاريخ الميلاد */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                {t("profile.dob")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                {member?.dob ? formatLongDate(member.dob, locale) : notSet}
              </p>
            </div>

            {/* 7. رقم الطوارئ */}
            <div className="rounded-xl bg-background/60 border border-border/60 p-3 col-span-2">
              <p className="text-2xs font-semibold text-foreground/70 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                {t("profile.emergency")}
              </p>
              <p className="text-sm font-bold text-foreground mt-0.5 truncate dir-ltr" dir="ltr">
                {member?.emergency || notSet}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. TWO-COLUMN DETAILS GRID (Membership First, then Health Stats) ── */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* ── Section A: Membership & Finance (Placed First) ── */}
        <Card>
          <CardContent className="space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground">
              {t("profile.membershipInfo")}
            </h2>
          </div>

          <div className="divide-y divide-border/40 text-xs">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70">{t("profile.membershipCard.plan")}</span>
              <span className="font-bold text-foreground">
                {member?.planType || member?.subscriptionStatus || notSet}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70">{t("profile.membershipCard.startDate")}</span>
              <span className="font-semibold text-foreground">
                {member?.subStartDate ? formatLongDate(member.subStartDate, locale) : notSet}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70">{t("profile.membershipCard.endDate")}</span>
              <span className="font-semibold text-foreground">
                {member?.subEndDate ? formatLongDate(member.subEndDate, locale) : notSet}
              </span>
            </div>
            {daysRemainingNum != null && subPeriod.totalDays > 0 && isSubActive && (
              <div className="py-2.5 space-y-1.5">
                <div className="flex justify-between text-2xs text-foreground/70 font-semibold">
                  <span>{isAr ? "المدة المتبقية" : "Remaining"}</span>
                  <span className="text-primary tabular-nums font-bold">
                    {daysRemainingNum} / {subPeriod.totalDays} {isAr ? "يوم" : "days"}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden border border-border/50">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(5, subPeriod.percentageLeft))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {member?.freezeDays != null && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-foreground/70 flex items-center gap-1">
                  <Snowflake className="w-3.5 h-3.5 text-blue-400" />
                  {t("profile.membershipCard.freezeDays")}
                </span>
                <span className="font-semibold text-foreground">
                  {member.freezeDays} {isAr ? "يوم" : "days"}
                </span>
              </div>
            )}
            {member?.balance != null && member.balance !== "" && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-foreground/70">{t("profile.membershipCard.balance")}</span>
                <span className="font-bold text-primary">{member.balance} د.أ</span>
              </div>
            )}
            {member?.commitmentStatus && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-foreground/70">{t("profile.membershipCard.commitment")}</span>
                <span className="font-semibold text-foreground">{member.commitmentStatus}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button
              onClick={() => setRenewModalOpen(true)}
              className="w-full h-10 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-md shadow-primary/20"
            >
              <CreditCard className="w-4 h-4" />
              <span>{isAr ? "تجديد الاشتراك أونلاين" : "Renew Subscription Online"}</span>
            </Button>
          </div>
          </CardContent>
        </Card>

        {/* ── Section B: Health & Body Stats ── */}
        <Card>
          <CardContent className="space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <HeartPulse className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground">
              {t("profile.healthInfo")}
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-card-hover p-3 text-center border border-border/50">
              <p className="text-2xs font-semibold text-foreground/70">{t("profile.weight")}</p>
              <p className="text-base font-extrabold text-foreground mt-1 tabular-nums">
                {member?.weight ? `${member.weight}` : "—"}
                {member?.weight && <span className="text-3xs font-normal text-foreground/70"> كغ</span>}
              </p>
            </div>
            <div className="rounded-xl bg-card-hover p-3 text-center border border-border/50">
              <p className="text-2xs font-semibold text-foreground/70">{t("profile.height")}</p>
              <p className="text-base font-extrabold text-foreground mt-1 tabular-nums">
                {member?.height ? `${member.height}` : "—"}
                {member?.height && <span className="text-3xs font-normal text-foreground/70"> م</span>}
              </p>
            </div>
            <div className="rounded-xl bg-card-hover p-3 text-center border border-border/50">
              <p className="text-2xs font-semibold text-foreground/70">{t("profile.bmi")}</p>
              <p className="text-base font-extrabold text-foreground mt-1 tabular-nums">
                {parsedBmi != null ? parsedBmi.toFixed(1) : "—"}
              </p>
            </div>
          </div>

          {parsedBmi != null && (
            <div className="flex items-center justify-between rounded-xl bg-card-hover px-3 py-2 border border-border/50">
              <span className="text-xs text-foreground/70">{t("profile.bmi")}:</span>
              {(() => {
                const cat = getBmiCategory(parsedBmi, isAr);
                return (
                  <span className={cn("px-2.5 py-0.5 rounded-full text-2xs font-bold border", cat.color)}>
                    {cat.text}
                  </span>
                );
              })()}
            </div>
          )}

          {member?.health && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs">
              <p className="font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {t("profile.health")}
              </p>
              <p className="text-foreground/90 leading-relaxed">{member.health}</p>
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* ── 3. APP SETTINGS & PREFERENCES ── */}
      <Card>
        <CardContent className="space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-foreground">
            {t("profile.appSettings")}
          </h2>
        </div>

        <div className="space-y-3">
          {/* Language Row */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card-hover border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-background border border-border/60 flex items-center justify-center text-primary shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t("profile.language")}</p>
                <p className="text-xs text-foreground/70">
                  {locale === "ar" ? "اللغة الحالية: العربية" : "Current: English"}
                </p>
              </div>
            </div>
            <LanguageSwitch size="md" />
          </div>

          {/* Theme Row */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-card-hover border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-background border border-border/60 flex items-center justify-center text-primary shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{locale === "ar" ? "مظهر التطبيق" : "App Theme"}</p>
                <p className="text-xs text-foreground/70">
                  {locale === "ar" ? "داكن / فاتح / حسب النظام" : "Dark / Light / System"}
                </p>
              </div>
            </div>
            <ThemeSwitch size="md" />
          </div>

          {/* Dynamic WhatsApp Support Row */}
          {isWaLinked && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                  <WhatsAppIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{t("whatsapp.contact")}</p>
                  <p className="text-xs text-foreground/70 truncate">
                    {waDisplayPhone || t("whatsapp.chatWithAdmin")}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => openWhatsApp(undefined, member?.name)}
                className="h-8 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0 cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t("whatsapp.directMessage")}</span>
              </Button>
            </div>
          )}
        </div>
        </CardContent>
      </Card>

      {/* ── 4. LOGOUT ACTION BUTTON ── */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="profile-logout-button w-full min-h-[40px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border border-red-500/40 bg-red-950/20 hover:bg-red-950/35 active:bg-red-950/50 active:scale-[0.985] text-red-500 hover:text-red-400 font-bold text-xs sm:text-sm transition-all duration-150 cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2"
          dir="rtl"
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : (
            <LogOut className="w-4 h-4 shrink-0" />
          )}
          <span>{isAr ? "تسجيل الخروج" : "Log Out"}</span>
        </button>
      </div>

      {/* Renew Subscription Modal */}
      <RenewSubscriptionModal
        open={renewModalOpen}
        onOpenChange={setRenewModalOpen}
        currentPlanName={member?.planType}
        currentSubEndDate={member?.subEndDate}
      />
    </div>
  );
}

