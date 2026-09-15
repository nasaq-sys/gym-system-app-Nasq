"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import BodyFatGauge from "@/components/shared/BodyFatGauge";
import AttendanceCalendar from "@/components/shared/AttendanceCalendar";
import NextBookingCard from "@/components/shared/NextBookingCard";
import DaysRing from "@/components/shared/DaysRing";
import HomeSkeleton from "@/components/shared/HomeSkeleton";
import {
  User,
  TrendingUp,
  Users,
  Dumbbell,
  Ruler,
  Apple,
  Coffee,
  CalendarDays,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Zap,
  Flame,
  Award,
  CreditCard,
} from "lucide-react";
import RenewSubscriptionModal from "@/components/shared/RenewSubscriptionModal";
import { cn } from "@/lib/utils";
import {
  fmt,
  formatLongDate,
  daysUntilEnd,
  spanDays,
} from "@/lib/format";
import { resolveSubscriptionPeriod } from "@/lib/subscriptionUtils";
import { getDailyTip, type DailyTip } from "@/lib/dailyTips";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";

interface MemberData {
  name: string;
  email: string;
  phone?: string;
  gender?: string;
  age?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  balance?: number | number[];
  health?: string;
  emergency?: string;
  active?: string;
  joinDate?: string;
  subscriptionStatus?: string | string[];
  planType?: string | string[];
  daysRemaining?: string | string[];
  totalSessions?: number | number[];
  trainerName?: string | string[];
  rank?: string | string[];
  subEndDate?: string | string[];
  subStartDate?: string | string[];
  subStatus?: string | string[];
}

interface ScanEntry {
  date: string;
  bodyFat: number;
  weight?: number;
  muscleMass?: number;
  goal: string;
  recordId: string;
}

interface StatsData {
  inBody: {
    latest: ScanEntry | null;
    history: ScanEntry[];
  };
}

interface RawBooking {
  kind: "event" | "facility";
  date: string;
  name: string;
  location?: string;
  startTime?: string;
  period?: string;
}

interface EventApiItem {
  name?: string;
  date?: string;
  startTime?: string;
  location?: string;
  isRegistered?: boolean;
}

interface FacilityBookingApiItem {
  date?: string;
  name?: string;
  period?: string;
  isBookedByMe?: boolean;
}

function pickNextBooking(
  events: EventApiItem[],
  facilityBookings: FacilityBookingApiItem[]
): RawBooking | null {
  const todayStr = new Date().toISOString().slice(0, 10);
  const candidates: RawBooking[] = [];

  for (const e of events) {
    if (!e.isRegistered || !e.date) continue;
    const date = String(e.date).slice(0, 10);
    if (date < todayStr) continue;
    candidates.push({
      kind: "event",
      date,
      name: String(e.name || ""),
      location: e.location ? String(e.location) : undefined,
      startTime: e.startTime ? String(e.startTime) : undefined,
    });
  }

  for (const b of facilityBookings) {
    if (!b.isBookedByMe || !b.date) continue;
    const date = String(b.date).slice(0, 10);
    if (date < todayStr) continue;
    candidates.push({
      kind: "facility",
      date,
      name: String(b.name || ""),
      period: b.period ? String(b.period) : undefined,
    });
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0] ?? null;
}

function getOccupancyLabel(count: number | null, isAr: boolean): { text: string; color: string } {
  if (count == null) return { text: "---", color: "text-foreground/70" };
  if (count < 15) return { text: isAr ? "أجواء هادئة" : "Calm Hours", color: "text-emerald-400" };
  if (count < 35) return { text: isAr ? "نشاط معتدل" : "Moderate", color: "text-blue-400" };
  if (count < 60) return { text: isAr ? "نشط الآن" : "Active Flow", color: "text-amber-400" };
  return { text: isAr ? "ساعات الذروة" : "Peak Hours", color: "text-red-400" };
}

export default function HomePage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const router = useRouter();

  const [member, setMember] = useState<MemberData | null>(() => getClientCachedData<MemberData>("/api/members"));
  const [stats, setStats] = useState<StatsData | null>(() => getClientCachedData<StatsData>("/api/stats"));
  const [gymCount, setGymCount] = useState<number | null>(() => getClientCachedData<number>("/api/gym-count"));
  const [nextBooking, setNextBooking] = useState<RawBooking | null>(() => getClientCachedData<RawBooking>("/api/events/page:nextBooking"));
  const [loading, setLoading] = useState(() => !getClientCachedData("/api/members"));
  const [currentTip] = useState<DailyTip>(() => getDailyTip());
  const [renewModalOpen, setRenewModalOpen] = useState(false);

  const fetchGymCount = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    fetch("/api/gym-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data && typeof res.data.count === "number") {
          setGymCount(res.data.count);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const POLL_INTERVAL = 2 * 60 * 1000;

    const startPolling = () => {
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = setInterval(fetchGymCount, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchGymCount();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      fetchGymCount();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchGymCount]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      clientFetch<MemberData>("/api/members", undefined, { ttlMs: 60000 }),
      clientFetch<StatsData>("/api/stats", undefined, { ttlMs: 60000 }),
    ])
      .then(([memberData, statsData]) => {
        if (cancelled) return;
        if (memberData) setMember(memberData);
        if (statsData) setStats(statsData);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    clientFetch<{ events?: EventApiItem[]; facilities?: FacilityBookingApiItem[] }>(
      "/api/events/page",
      undefined,
      { ttlMs: 60000 }
    )
      .then((res) => {
        if (cancelled) return;
        const next = pickNextBooking(res?.events || [], res?.facilities || []);
        setNextBooking(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading && !member) {
    return <HomeSkeleton />;
  }

  const rawName = member?.name;
  const displayName = (Array.isArray(rawName) ? rawName[0] : rawName)?.trim();
  const memberDisplayName = displayName && displayName !== "Member" ? displayName : (isAr ? "مشتركنا العزيز" : "Member");

  const latestScan = stats?.inBody?.latest;

  const subPeriod = resolveSubscriptionPeriod(member);
  const endDateValue = Array.isArray(member?.subEndDate) ? member?.subEndDate[0] : member?.subEndDate;
  const startDateValue = Array.isArray(member?.subStartDate) ? member?.subStartDate[0] : member?.subStartDate;
  const daysLeft = subPeriod.daysLeft;
  const totalDays = subPeriod.totalDays;
  const isSubEnded = subPeriod.isExpired;

  const nextBookingDisplay = nextBooking
    ? {
        tag:
          nextBooking.kind === "event"
            ? t("nextBooking.eventTag")
            : t("nextBooking.facilityTag"),
        name: nextBooking.name || "---",
        info:
          formatLongDate(nextBooking.date, locale) +
          (nextBooking.startTime || nextBooking.period
            ? ` · ${nextBooking.startTime || nextBooking.period}`
            : ""),
        location: nextBooking.location,
        daysLabel: (() => {
          const n = daysUntilEnd(nextBooking.date) ?? 0;
          if (n <= 0) return t("nextBooking.today");
          if (n === 1) return t("nextBooking.tomorrow");
          return t("nextBooking.inDays", { n: String(n) });
        })(),
      }
    : null;

  const occupancy = getOccupancyLabel(gymCount, isAr);

  return (
    <div className="pb-12">
      {/* ══════════════════════════════════════════════════════════════
          📱 MOBILE — simplified single-column layout (< lg only).
          Deliberately leaves out the quick-actions strip, membership
          widget, and gym-hub shortcuts that the desktop layout below
          has room for; the bottom nav already covers primary navigation
          on mobile, so the home screen here stays to the essentials.
         ══════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden space-y-6">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-foreground tracking-tight break-words">
              {t("home.greeting", { name: memberDisplayName })}
            </h1>
            <p className="text-xs text-foreground/70 mt-1">
              {isAr
                ? "تابع تقدمك الرياضي وبيانات اشتراكك"
                : "Track your fitness progress and subscription"}
            </p>
          </div>
          <div className="shrink-0">
            {isSubEnded ? (
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-2xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0 animate-pulse" />
                  <span>{t("home.subscriptionEnded")}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setRenewModalOpen(true)}
                  className="h-7 text-2xs px-2.5 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1 shadow-xs transition-all active:scale-98 cursor-pointer"
                >
                  <CreditCard className="w-3 h-3" />
                  <span>{isAr ? "تجديد الآن" : "Renew"}</span>
                </Button>
              </div>
            ) : (
              daysLeft != null &&
              daysLeft > 0 && (
                <DaysRing
                  daysLeft={daysLeft}
                  totalDays={totalDays}
                  size={54}
                  strokeWidth={5}
                  planTitle={subPeriod.planTitle}
                  endDate={endDateValue}
                  startDate={startDateValue}
                  showSubtitle={true}
                  interactive={true}
                  expiredLabel="!"
                />
              )
            )}
          </div>
        </div>

        <Card className="p-4 flex items-center justify-between gap-3 shadow-sm bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold text-xs shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>{t("home.liveTag")}</span>
            </Badge>
            <span className="text-xs font-bold text-foreground truncate">
              {t("home.nowInGym")}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("text-2xs font-semibold", occupancy.color)}>
              {occupancy.text}
            </span>
            <span className="text-3xl font-black leading-none text-primary tabular-nums">
              {gymCount != null ? gymCount : "---"}
            </span>
          </div>
        </Card>

        <BodyFatGauge
          bodyFatPercent={latestScan?.bodyFat ?? null}
          history={stats?.inBody?.history}
        />

        <AttendanceCalendar />

        <Card className="p-5 shadow-sm space-y-3">
          <CardHeader title={t("home.quickStats")} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t("profile.weight"), value: fmt(member?.weight, "kg"), icon: <TrendingUp className="w-4 h-4 text-primary" /> },
              { label: t("profile.height"), value: fmt(member?.height, "cm"), icon: <Ruler className="w-4 h-4 text-primary" /> },
              { label: t("profile.age"), value: fmt(member?.age), icon: <User className="w-4 h-4 text-primary" /> },
              {
                label: t("profile.gender"),
                value: String(member?.gender || "").includes("ذكر") || String(member?.gender || "").toLowerCase() === "male"
                  ? t("profile.male")
                  : String(member?.gender || "").includes("انث") || String(member?.gender || "").includes("أنث") || String(member?.gender || "").toLowerCase() === "female"
                    ? t("profile.female")
                    : fmt(member?.gender),
                icon: <User className="w-4 h-4 text-primary" />,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-muted/40 rounded-xl p-3.5 text-center border border-border/60 hover:border-primary/40 transition-all"
              >
                <div className="flex justify-center mb-1.5">{item.icon}</div>
                <p className="text-2xs text-foreground/70 font-medium">{item.label}</p>
                <p className="text-base font-extrabold text-foreground mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 shadow-sm space-y-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <div className="flex items-center gap-2 text-amber-400">
            <Flame className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isAr ? "نصيحة اليوم" : "Daily Tip"} · {isAr ? currentTip.categoryAr : currentTip.categoryEn}
            </span>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed font-medium">
            {isAr ? currentTip.tipAr : currentTip.tipEn}
          </p>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          🖥️ DESKTOP — full layout, unchanged (≥ lg only)
         ══════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block space-y-6">
      {/* ══════════════════════════════════════════════════════════════
          🌟 1. UNIFIED RESPONSIVE HERO BANNER
         ══════════════════════════════════════════════════════════════ */}
      <Card className="p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Greeting & Motivation */}
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary text-primary-foreground font-bold text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? "يوم مليء بالطاقة والنشاط" : "High Energy Today"}</span>
              </Badge>
              {member?.rank && (
                <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold text-xs">
                  <Award className="w-3.5 h-3.5" />
                  <span>{Array.isArray(member.rank) ? member.rank[0] : member.rank}</span>
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight break-words">
              {t("home.greeting", { name: memberDisplayName })}
            </h1>
            <p className="text-xs sm:text-sm text-foreground/70 leading-relaxed max-w-2xl">
              {isAr
                ? "مرحباً بك في لوحة تحكمك الرياضية. تابع قياساتك، سجل حضورك، وتمرّن بقوة اليوم!"
                : "Welcome to your fitness dashboard. Track progress, monitor attendance, and crush your workout today!"}
            </p>
          </div>

          {/* Subscription Ring & Status Badge */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/80 shadow-xs shrink-0 self-start md:self-auto">
            {isSubEnded ? (
              <div className="flex flex-col items-start md:items-end gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0 animate-pulse" />
                  <span>{t("home.subscriptionEnded")}</span>
                </div>
                <span className="text-2xs text-muted-foreground font-medium">
                  {isAr ? "يرجى التجديد للاستمرار" : "Please renew to access"}
                </span>
                <Button
                  size="sm"
                  onClick={() => setRenewModalOpen(true)}
                  className="h-8.5 px-3.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{isAr ? "تجديد الاشتراك أونلاين" : "Renew Online"}</span>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-start text-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{isAr ? "الاشتراك نشط" : "Active Plan"}</span>
                  </span>
                  <span className="text-2xs text-foreground/70 mt-0.5 font-medium">
                    {member?.planType ? (Array.isArray(member.planType) ? member.planType[0] : member.planType) : "Nasaq Gym"}
                  </span>
                </div>
                {daysLeft != null && daysLeft > 0 && (
                  <DaysRing
                    daysLeft={daysLeft}
                    totalDays={totalDays}
                    size={46}
                    strokeWidth={4}
                    planTitle={subPeriod.planTitle}
                    endDate={endDateValue}
                    startDate={startDateValue}
                    showSubtitle={true}
                    interactive={true}
                    expiredLabel="!"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Quick Action Navigation Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pt-4 mt-4 border-t border-border/60">
          <span className="text-2xs font-bold text-foreground/70 uppercase tracking-wider shrink-0">
            {isAr ? "روابط سريعة:" : "Quick Actions:"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/workouts"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-xl font-bold text-xs")}
            >
              <Dumbbell className="w-3.5 h-3.5 text-primary" />
              <span>{isAr ? "جدول التمارين" : "Workout Plan"}</span>
            </Link>
            <Link
              href="/nutrition"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-xl font-bold text-xs")}
            >
              <Apple className="w-3.5 h-3.5 text-primary" />
              <span>{isAr ? "الخطة الغذائية" : "Nutrition Plan"}</span>
            </Link>
            <Link
              href="/shop"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-xl font-bold text-xs")}
            >
              <Coffee className="w-3.5 h-3.5 text-primary" />
              <span>{isAr ? "كافيه ومتجر النادي" : "Cafe & Store"}</span>
            </Link>
            <Link
              href="/events"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-xl font-bold text-xs")}
            >
              <CalendarDays className="w-3.5 h-3.5 text-primary" />
              <span>{isAr ? "المرافق والفعاليات" : "Facilities & Events"}</span>
            </Link>
          </div>
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          📊 2. TOP METRICS ROW (Live Count, Body Fat, Next Booking)
         ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        {/* Live Occupancy Gauge Card */}
        <Card className="p-5 flex flex-col justify-between shadow-sm bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">
              {t("home.liveAttendance")}
            </span>
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>{t("home.liveTag")}</span>
            </Badge>
          </div>

          <div className="my-auto py-2 flex items-baseline justify-between">
            <div>
              <span className="text-4xl font-black text-primary tabular-nums">
                {gymCount != null ? gymCount : "---"}
              </span>
              <span className="text-xs text-foreground/70 font-semibold ms-1.5">
                {t("home.traineesNow")}
              </span>
            </div>
            <div className="text-end">
              <span className={cn("text-xs font-bold block", occupancy.color)}>
                {occupancy.text}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-2xs text-foreground/70 pt-2 border-t border-border/60">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span>{t("home.liveSensors")}</span>
          </div>
        </Card>

        {/* InBody / Body Fat Metric Card */}
        <BodyFatGauge
          bodyFatPercent={latestScan?.bodyFat ?? null}
          history={stats?.inBody?.history}
        />

        {/* Next Booking Card (or Gym Info shortcut if no booking) */}
        {nextBookingDisplay ? (
          <NextBookingCard
            tag={nextBookingDisplay.tag}
            name={nextBookingDisplay.name}
            info={nextBookingDisplay.info}
            location={nextBookingDisplay.location}
            daysLabel={nextBookingDisplay.daysLabel}
          />
        ) : (
          <Card className="p-5 flex flex-col justify-between shadow-sm">
            <CardHeader title={isAr ? "عضوية النادي" : "Membership"} />
            <div className="grid grid-cols-2 gap-2 my-auto">
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-center">
                <span className="text-3xs font-bold text-foreground/70">{t("profile.weight")}</span>
                <p className="text-base font-extrabold text-foreground mt-0.5">{fmt(member?.weight, "kg")}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-center">
                <span className="text-3xs font-bold text-foreground/70">{t("profile.height")}</span>
                <p className="text-base font-extrabold text-foreground mt-0.5">{fmt(member?.height, "cm")}</p>
              </div>
            </div>
            <p className="text-2xs text-foreground/70 text-center pt-2 border-t border-border/60">
              {isAr ? "نادي Nasaq Gym — لياقة وصحة متكاملة" : "Nasaq Gym — Fitness & Health"}
            </p>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          🗓️ 3. MAIN DASHBOARD CONTENT GRID (Calendar, Stats, Sidebar)
         ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary Main Column (8 Cols on Desktop) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Attendance Calendar */}
          <AttendanceCalendar />

          {/* Physical Stats Quick View Card */}
          <Card className="p-5 shadow-sm space-y-3">
            <CardHeader
              title={t("home.quickStats")}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("profile.weight"), value: fmt(member?.weight, "kg"), icon: <TrendingUp className="w-4 h-4 text-primary" /> },
                { label: t("profile.height"), value: fmt(member?.height, "cm"), icon: <Ruler className="w-4 h-4 text-primary" /> },
                { label: t("profile.age"), value: fmt(member?.age), icon: <User className="w-4 h-4 text-primary" /> },
                {
                  label: t("profile.gender"),
                  value: String(member?.gender || "").includes("ذكر") || String(member?.gender || "").toLowerCase() === "male"
                    ? t("profile.male")
                    : String(member?.gender || "").includes("انث") || String(member?.gender || "").includes("أنث") || String(member?.gender || "").toLowerCase() === "female"
                      ? t("profile.female")
                      : fmt(member?.gender),
                  icon: <User className="w-4 h-4 text-primary" />,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-muted/40 rounded-xl p-3.5 text-center border border-border/60 hover:border-primary/40 transition-all"
                >
                  <div className="flex justify-center mb-1.5">{item.icon}</div>
                  <p className="text-2xs text-foreground/70 font-medium">{item.label}</p>
                  <p className="text-base font-extrabold text-foreground mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Secondary Column (4 Cols on Desktop) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Membership Summary Widget */}
          <Card className="p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {isAr ? "بطاقة العضوية والاشتراك" : "Membership Pass"}
                </h3>
              </div>
              <Link
                href="/profile"
                className="text-2xs font-bold text-primary hover:underline"
              >
                {isAr ? "التفاصيل" : "Details"}
              </Link>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-foreground/70">{isAr ? "الباقة" : "Plan"}:</span>
                <span className="font-bold text-foreground">
                  {member?.planType ? (Array.isArray(member.planType) ? member.planType[0] : member.planType) : "Nasaq Gym"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-foreground/70">{isAr ? "المدرب المسؤول" : "Trainer"}:</span>
                <span className="font-semibold text-foreground">
                  {member?.trainerName ? (Array.isArray(member.trainerName) ? member.trainerName[0] : member.trainerName) : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-foreground/70">{isAr ? "تاريخ الانتهاء" : "End Date"}:</span>
                <span className="font-semibold text-foreground">
                  {endDateValue ? formatLongDate(endDateValue, locale) : "—"}
                </span>
              </div>

              {/* Progress bar for remaining days */}
              {daysLeft != null && totalDays > 0 && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex justify-between text-2xs text-foreground/70">
                    <span>{isAr ? "المدة المتبقية" : "Remaining"}</span>
                    <span className="font-bold text-primary tabular-nums">
                      {daysLeft} / {totalDays} {isAr ? "يوم" : "days"}
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
            </div>
          </Card>

          {/* Quick Shortcuts & Gym Hub */}
          <Card className="p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border/60">
              <Zap className="w-4 h-4 text-primary" />
              <span>{isAr ? "خدمات سريعة للنادي" : "Gym Hub"}</span>
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/workouts"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-center group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Dumbbell className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-foreground mt-2">
                  {isAr ? "التمارين" : "Workouts"}
                </span>
                <span className="text-3xs text-foreground/70 mt-0.5">
                  {isAr ? "جدولك الأسبوعي" : "Weekly Plan"}
                </span>
              </Link>

              <Link
                href="/nutrition"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-center group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Apple className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-foreground mt-2">
                  {isAr ? "التغذية" : "Nutrition"}
                </span>
                <span className="text-3xs text-foreground/70 mt-0.5">
                  {isAr ? "نظامك الغذائي" : "Meal Plans"}
                </span>
              </Link>

              <Link
                href="/shop"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-center group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Coffee className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-foreground mt-2">
                  {isAr ? "الكافيه والمتجر" : "Cafe & Store"}
                </span>
                <span className="text-3xs text-foreground/70 mt-0.5">
                  {isAr ? "مشروبات ومكملات" : "Shakes & Drinks"}
                </span>
              </Link>

              <Link
                href="/events"
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-muted/40 border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-center group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-foreground mt-2">
                  {isAr ? "الفعاليات والمرافق" : "Events & Gym"}
                </span>
                <span className="text-3xs text-foreground/70 mt-0.5">
                  {isAr ? "الحجوزات والأنشطة" : "Bookings & Hub"}
                </span>
              </Link>
            </div>
          </Card>

          {/* Daily Motivation & Tip */}
          <Card className="p-4 shadow-sm space-y-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
            <div className="flex items-center gap-2 text-amber-400">
              <Flame className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {isAr ? "نصيحة اليوم" : "Daily Tip"} · {isAr ? currentTip.categoryAr : currentTip.categoryEn}
              </span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed font-medium">
              {isAr ? currentTip.tipAr : currentTip.tipEn}
            </p>
          </Card>
        </div>
      </div>
      </div>

      <RenewSubscriptionModal
        open={renewModalOpen}
        onOpenChange={setRenewModalOpen}
        currentPlanName={Array.isArray(member?.planType) ? member?.planType[0] : member?.planType}
        currentSubEndDate={Array.isArray(member?.subEndDate) ? member?.subEndDate[0] : member?.subEndDate}
      />
    </div>
  );
}
