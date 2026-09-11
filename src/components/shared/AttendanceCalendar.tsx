"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDuration, weekdayFullLabels } from "@/lib/format";

interface AttendanceCalendarProps {
  className?: string;
}

interface MonthData {
  year: number;
  month: number; // 1-12
  attendedDays: number[];
}

interface DayDetail {
  totalMinutes: number;
  hasAttendance: boolean;
  isLive: boolean;
  firstEntry?: string | null;
  lastExit?: string | null;
}

type MonthMode = "current" | "last";

function formatClockTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildMonthCells(
  firstWeekday: number,
  daysInMonth: number
): (number | null)[] {
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function buildWeekCells(
  year: number,
  month: number,
  anchorDay: number,
  daysInMonth: number
): (number | null)[] {
  const anchorWeekday = new Date(year, month - 1, anchorDay).getDay();
  const weekStart = anchorDay - anchorWeekday;
  return Array.from({ length: 7 }, (_, i) => {
    const d = weekStart + i;
    return d >= 1 && d <= daysInMonth ? d : null;
  });
}

export default function AttendanceCalendar({ className }: AttendanceCalendarProps) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [monthMode, setMonthMode] = useState<MonthMode>("current");
  const [currentData, setCurrentData] = useState<MonthData | null>(null);
  const [lastData, setLastData] = useState<MonthData | null>(null);
  const [lastLoading, setLastLoading] = useState(false);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/attendance")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setCurrentData(res.data);
      })
      .catch(() => {});
  }, []);

  const fetchLastMonth = useCallback(() => {
    if (lastData || lastLoading) return;
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prev.getFullYear();
    const m = prev.getMonth() + 1;
    const monthParam = `${y}-${String(m).padStart(2, "0")}`;
    setLastLoading(true);
    fetch(`/api/attendance?month=${monthParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setLastData(res.data);
      })
      .catch(() => {})
      .finally(() => setLastLoading(false));
  }, [lastData, lastLoading]);

  const activeData = useMemo(() => {
    if (!expanded) return currentData;
    return monthMode === "current" ? currentData : lastData;
  }, [expanded, monthMode, currentData, lastData]);

  const now = new Date();
  const isCurrentMonthActive =
    !activeData ||
    (activeData.year === now.getFullYear() &&
      activeData.month === now.getMonth() + 1);

  const todayDate = isCurrentMonthActive ? now.getDate() : -1;

  const attendedSet = useMemo(
    () => new Set(activeData?.attendedDays ?? []),
    [activeData]
  );

  const cells = useMemo(() => {
    if (!activeData) return [];
    const { year, month } = activeData;
    const daysInMonth = new Date(year, month, 0).getDate();

    if (expanded) {
      const firstWeekday = new Date(year, month - 1, 1).getDay();
      return buildMonthCells(firstWeekday, daysInMonth);
    }
    const anchor = todayDate > 0 ? todayDate : 1;
    return buildWeekCells(year, month, anchor, daysInMonth);
  }, [activeData, expanded, todayDate]);

  const weekdayLabels = useMemo(
    () => weekdayFullLabels(locale).map((w) => (locale === "ar" ? w : w.slice(0, 3))),
    [locale]
  );

  const handleToggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    setSelectedDay(null);
    setDayDetail(null);
    if (next && monthMode === "last" && !lastData) {
      fetchLastMonth();
    }
  };

  const handleMonthMode = (mode: MonthMode) => {
    setMonthMode(mode);
    setSelectedDay(null);
    setDayDetail(null);
    if (mode === "last") {
      fetchLastMonth();
    }
  };

  const handleDayClick = async (day: number) => {
    if (!activeData) return;
    if (selectedDay === day) {
      setSelectedDay(null);
      setDayDetail(null);
      return;
    }
    setSelectedDay(day);
    setDayDetailLoading(true);
    setDayDetail(null);
    const dateStr = isoDate(activeData.year, activeData.month, day);
    try {
      const res = await fetch(`/api/attendance/day?date=${dateStr}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        setDayDetail(json.data);
      } else {
        setDayDetail({ totalMinutes: 0, hasAttendance: false, isLive: false });
      }
    } catch {
      setDayDetail({ totalMinutes: 0, hasAttendance: false, isLive: false });
    } finally {
      setDayDetailLoading(false);
    }
  };

  const monthLabel = useMemo(() => {
    if (!activeData) return "";
    const d = new Date(activeData.year, activeData.month - 1, 1);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
      month: "long",
      year: "numeric",
    }).format(d);
  }, [activeData, locale]);

  const selectedDayLabel = useMemo(() => {
    if (!activeData || selectedDay == null) return "";
    const d = new Date(activeData.year, activeData.month - 1, selectedDay);
    const formatted = new Intl.DateTimeFormat(
      locale === "ar" ? "ar" : "en-US",
      { weekday: "long", day: "numeric", month: "long" }
    ).format(d);
    if (selectedDay === todayDate) {
      return `${formatted} (${t("attendanceCalendar.today")})`;
    }
    return formatted;
  }, [activeData, selectedDay, todayDate, locale, t]);

  return (
    <Card className={className}>
      <CardContent>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">
          {t("attendanceCalendar.title")}
        </h3>
        <button
          type="button"
          onClick={handleToggleExpand}
          className="flex items-center gap-1 text-sm font-semibold text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
        >
          <span>{expanded ? monthLabel : t("attendanceCalendar.thisWeek")}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-1 bg-muted/40 rounded-xl p-1 mb-4">
          <button
            type="button"
            onClick={() => handleMonthMode("current")}
            className={cn(
              "rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer",
              monthMode === "current"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            {t("attendanceCalendar.currentMonth")}
          </button>
          <button
            type="button"
            onClick={() => handleMonthMode("last")}
            className={cn(
              "rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer",
              monthMode === "last"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            {t("attendanceCalendar.lastMonth")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {weekdayLabels.map((label, i) => (
          <div
            key={i}
            className="text-center text-[9px] leading-tight text-foreground/70 font-medium py-1 break-words"
          >
            {label}
          </div>
        ))}
      </div>

      {!activeData ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} aria-hidden />;
            const attended = attendedSet.has(day);
            const isToday = day === todayDate;
            const isFuture = !!activeData && (() => {
              const d = new Date(activeData.year, activeData.month - 1, day);
              d.setHours(0, 0, 0, 0);
              const t0 = new Date();
              t0.setHours(0, 0, 0, 0);
              return d.getTime() > t0.getTime();
            })();
            return (
              <button
                key={i}
                type="button"
                disabled={isFuture}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "aspect-square rounded-xl flex items-center justify-center text-[13px] font-bold tabular-nums transition-all",
                  attended
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/40 text-foreground/70 hover:bg-muted/60 hover:text-foreground",
                  isToday && "ring-2 ring-primary",
                  isToday && !attended && "bg-transparent text-foreground",
                  selectedDay === day && "ring-2 ring-foreground/40",
                  isFuture ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      )}

      {selectedDay != null && (
        <div className="mt-3.5 pt-3.5 border-t border-border/60">
          {dayDetailLoading ? (
            <div className="flex items-center justify-center py-3">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : dayDetail ? (
            <div className="rounded-2xl bg-muted/40 border border-border/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      !dayDetail.hasAttendance
                        ? "bg-muted text-foreground/70"
                        : dayDetail.isLive
                          ? "bg-success/15 text-success"
                          : "bg-primary/15 text-primary"
                    )}
                  >
                    <Clock className="w-[18px] h-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">
                      {selectedDayLabel}
                    </p>
                    <p className="text-2xs text-foreground/70 mt-0.5">
                      {!dayDetail.hasAttendance
                        ? t("attendanceCalendar.noAttendance")
                        : dayDetail.isLive
                          ? t("attendanceCalendar.sessionOngoing")
                          : t("attendanceCalendar.totalTime")}
                    </p>
                  </div>
                </div>

                {!dayDetail.hasAttendance ? (
                  <span className="text-lg font-extrabold text-foreground/70 shrink-0">—</span>
                ) : dayDetail.isLive ? (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex items-center gap-1.5 rounded-full bg-success/10 text-success px-2.5 py-1 text-2xs font-bold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                      </span>
                      {t("attendanceCalendar.stillInside")}
                    </span>
                    {dayDetail.totalMinutes > 0 && (
                      <span className="text-xs font-bold text-primary tabular-nums">
                        {formatDuration(dayDetail.totalMinutes, locale)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-lg font-extrabold text-primary tabular-nums shrink-0">
                    {dayDetail.totalMinutes > 0
                      ? formatDuration(dayDetail.totalMinutes, locale)
                      : (locale === "ar" ? "تم الحضور" : "Attended")}
                  </span>
                )}
              </div>

              {/* Detailed Check-in / Check-out timestamps pill */}
              {dayDetail.hasAttendance && (dayDetail.firstEntry || dayDetail.lastExit) && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-2xs text-foreground/70 flex-wrap">
                  {dayDetail.firstEntry && (
                    <span className="inline-flex items-center gap-1 bg-background/60 px-2 py-1 rounded-lg border border-border/50">
                      <span className="text-primary font-bold">
                        {locale === "ar" ? "الدخول:" : "In:"}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {formatClockTime(dayDetail.firstEntry, locale)}
                      </span>
                    </span>
                  )}
                  {dayDetail.lastExit && dayDetail.lastExit !== dayDetail.firstEntry && (
                    <span className="inline-flex items-center gap-1 bg-background/60 px-2 py-1 rounded-lg border border-border/50">
                      <span className="text-info font-bold">
                        {locale === "ar" ? "الخروج:" : "Out:"}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {formatClockTime(dayDetail.lastExit, locale)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-end gap-4 mt-4 pt-3 border-t border-border/60">
        <span className="flex items-center gap-1.5 text-2xs text-foreground/70 font-medium">
          {t("attendanceCalendar.today")}
          <span className="w-3 h-3 rounded-full ring-2 ring-primary shrink-0" />
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-foreground/70 font-medium">
          {t("attendanceCalendar.attended")}
          <span className="w-3 h-3 rounded-full bg-primary shrink-0" />
        </span>
      </div>
      </CardContent>
    </Card>
  );
}
