"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  List,
  Utensils,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";

export interface MealLogEntry {
  description: string;
  quantityGrams: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  date: string;
}

interface TraineeMealLogsCalendarProps {
  mealLogs: MealLogEntry[];
  isAr: boolean;
}

function isoDate(year: number, monthZeroIndexed: number, day: number): string {
  const m = String(monthZeroIndexed + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function TraineeMealLogsCalendar({
  mealLogs,
  isAr,
}: TraineeMealLogsCalendarProps) {
  // 1. Group meals by date (YYYY-MM-DD)
  const mealsByDate = useMemo(() => {
    const map: Record<string, MealLogEntry[]> = {};
    for (const m of mealLogs) {
      if (!m.date) continue;
      const key = m.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    return map;
  }, [mealLogs]);

  // Unique sorted dates with logged meals (descending: newest first)
  const loggedDates = useMemo(() => {
    return Object.keys(mealsByDate).sort((a, b) => b.localeCompare(a));
  }, [mealsByDate]);

  const todayIso = useMemo(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  // Selected date state: defaults to current day (اليوم الحالي)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  // View month state (0-indexed): defaults to current month of today
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Toggle view between Calendar and List
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 6 = Sat

  // Calendar cells
  const cells = useMemo(() => {
    const list: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      list.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(d);
    }
    while (list.length % 7 !== 0) {
      list.push(null);
    }
    return list;
  }, [firstDayOfWeek, daysInMonth]);

  const weekdayLabels = useMemo(() => {
    return isAr
      ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  }, [isAr]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(isAr ? "ar-JO" : "en-US", {
      month: "long",
      year: "numeric",
    }).format(currentMonth);
  }, [currentMonth, isAr]);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      setCurrentMonth(new Date(parts[0], parts[1] - 1, 1));
    }
  };

  // Compute day totals helper
  const computeDayTotals = (list: MealLogEntry[]) => {
    const totalCals = list.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalProtein = Math.round(list.reduce((sum, m) => sum + (m.protein || 0), 0) * 10) / 10;
    const totalCarbs = Math.round(list.reduce((sum, m) => sum + (m.carbs || 0), 0) * 10) / 10;
    const totalFat = Math.round(list.reduce((sum, m) => sum + (m.fat || 0), 0) * 10) / 10;
    return { totalCals, totalProtein, totalCarbs, totalFat };
  };

  const selectedMeals = selectedDate ? mealsByDate[selectedDate] ?? [] : [];
  const selectedTotals = computeDayTotals(selectedMeals);

  // Chevron direction: in RTL (Arabic), "next" moves left, "prev" moves right
  const PrevIcon = isAr ? ChevronRight : ChevronLeft;
  const NextIcon = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-4">
      {/* ── View Controls & Month Navigation ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 bg-background/80 rounded-2xl border border-border/70 shadow-xs">
        {/* Month Title & Nav */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label={isAr ? "الشهر السابق" : "Previous Month"}
            className="w-8 h-8 rounded-xl bg-card border border-border/80 flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
          >
            <PrevIcon className="w-4 h-4" />
          </button>

          <span className="text-xs sm:text-sm font-black text-foreground px-2 min-w-[120px] text-center">
            {monthLabel}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label={isAr ? "الشهر التالي" : "Next Month"}
            className="w-8 h-8 rounded-xl bg-card border border-border/80 flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
          >
            <NextIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleSelectDate(todayIso)}
            className="ms-1 px-2.5 py-1 rounded-xl text-2xs font-bold bg-card border border-border/80 text-foreground/70 hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
          >
            {isAr ? "اليوم" : "Today"}
          </button>
        </div>

        {/* View Switcher (Calendar vs List) */}
        <div className="flex items-center gap-1 bg-card rounded-xl p-1 border border-border/80">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-bold transition-all cursor-pointer",
              viewMode === "calendar"
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{isAr ? "تقويم" : "Calendar"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-bold transition-all cursor-pointer",
              viewMode === "list"
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            <List className="w-3.5 h-3.5" />
            <span>{isAr ? "قائمة" : "List"}</span>
          </button>
        </div>
      </div>

      {/* ── Quick Chips of Dates with Logged Meals ── */}
      {loggedDates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-2xs font-bold text-foreground/70 px-1">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" />
              <span>{isAr ? "الأيام المسجل بها وجبات (اضغط للانتقال):" : "Days with logged meals:"}</span>
            </span>
            <span className="text-3xs px-2 py-0.5 rounded-full bg-card border border-border">
              {loggedDates.length} {isAr ? "أيام" : "days"}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
            {loggedDates.map((d) => {
              const count = mealsByDate[d]?.length || 0;
              const cals = mealsByDate[d]?.reduce((sum, m) => sum + (m.calories || 0), 0) || 0;
              const isSel = selectedDate === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleSelectDate(d)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-2xs font-bold transition-all cursor-pointer border",
                    isSel
                      ? "bg-primary text-primary-foreground border-primary shadow-xs scale-[1.02]"
                      : "bg-card border-border/80 text-foreground/80 hover:bg-card-hover hover:text-foreground"
                  )}
                >
                  <CalendarIcon className="w-3 h-3 shrink-0" />
                  <span>{d}</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-3xs font-mono",
                      isSel ? "bg-black/20 text-primary-foreground" : "bg-card-hover text-foreground/60"
                    )}
                  >
                    {count} {isAr ? "وجبة" : "meals"}
                  </span>
                  {cals > 0 && (
                    <span
                      className={cn(
                        "text-3xs font-mono",
                        isSel ? "text-primary-foreground/90 font-bold" : "text-amber-500 font-bold"
                      )}
                    >
                      {cals} cal
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main View: Calendar Grid vs Full List ── */}
      {viewMode === "calendar" ? (
        <div className="bg-background rounded-2xl p-3 sm:p-4 border border-border/80 shadow-xs space-y-2">
          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            {weekdayLabels.map((lbl, idx) => (
              <div
                key={idx}
                className="text-2xs sm:text-xs font-bold text-foreground/60 py-1"
              >
                {lbl}
              </div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((day, i) => {
              if (day == null) {
                return <div key={`empty-${i}`} className="aspect-square" aria-hidden />;
              }

              const dateStr = isoDate(year, month, day);
              const dayMeals = mealsByDate[dateStr];
              const hasMeals = !!dayMeals && dayMeals.length > 0;
              const isSelected = selectedDate === dateStr;
              const isToday = todayIso === dateStr;
              const totalCals = hasMeals
                ? dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0)
                : 0;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDate(dateStr)}
                  title={hasMeals ? (isAr ? `${totalCals} سعرة مسجلة` : `${totalCals} kcal logged`) : undefined}
                  className={cn(
                    "aspect-square rounded-full flex items-center justify-center text-xs sm:text-sm font-bold tabular-nums transition-all relative cursor-pointer select-none",
                    // Logged days: Solid filled circle (الدائرة المليانة)
                    hasMeals && "bg-primary text-primary-foreground font-black shadow-xs",
                    // Current day: Hollow empty circle (الدائرة الفاضية)
                    isToday && !hasMeals && "ring-2 ring-primary bg-transparent text-primary font-black",
                    isToday && hasMeals && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    // Unlogged days and not today
                    !hasMeals && !isToday && "bg-card-hover/35 text-foreground/70 hover:bg-card-hover hover:text-foreground",
                    // Selected state
                    isSelected && (hasMeals
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-105 shadow-md z-10"
                      : "ring-2 ring-foreground/70 scale-105 z-10")
                  )}
                >
                  <span>{day}</span>
                </button>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="flex items-center justify-end gap-5 pt-3 mt-1 border-t border-border/60">
            <span className="flex items-center gap-2 text-2xs text-foreground/70 font-semibold">
              <span className="w-3.5 h-3.5 rounded-full ring-2 ring-primary bg-transparent shrink-0" />
              <span>{isAr ? "اليوم الحالي" : "Today"}</span>
            </span>
            <span className="flex items-center gap-2 text-2xs text-foreground/70 font-semibold">
              <span className="w-3.5 h-3.5 rounded-full bg-primary shrink-0" />
              <span>{isAr ? "أيام مسجل فيها وجبات" : "Days with logged meals"}</span>
            </span>
          </div>
        </div>
      ) : (
        /* Full List Mode */
        <div className="space-y-3">
          {loggedDates.map((date) => {
            const dayMeals = mealsByDate[date];
            const { totalCals, totalProtein, totalCarbs, totalFat } = computeDayTotals(dayMeals);
            return (
              <div
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setViewMode("calendar");
                }}
                className="bg-background rounded-2xl p-3.5 border border-border/80 space-y-2.5 hover:border-primary/60 transition-colors cursor-pointer"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-xs font-black text-foreground">{date}</span>
                    <span className="text-3xs px-2 py-0.5 rounded-full bg-card-hover font-bold text-foreground/70">
                      {dayMeals.length} {isAr ? "أصناف" : "items"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-3xs font-bold">
                    {totalCals > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-500 flex items-center gap-1 font-mono">
                        <Flame className="w-2.5 h-2.5" />
                        <span>{totalCals} {isAr ? "سعرة" : "kcal"}</span>
                      </span>
                    )}
                    {totalProtein > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-500 font-mono">
                        {isAr ? "بروتين" : "P"}: {totalProtein}g
                      </span>
                    )}
                    {totalCarbs > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-500 font-mono">
                        {isAr ? "كارب" : "C"}: {totalCarbs}g
                      </span>
                    )}
                    {totalFat > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/25 text-purple-500 font-mono">
                        {isAr ? "دهون" : "F"}: {totalFat}g
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {dayMeals.map((m, mIdx) => (
                    <div
                      key={mIdx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 bg-card rounded-xl border border-border/60 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 text-accent flex items-center justify-center shrink-0">
                          <Utensils className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-foreground truncate">
                          {m.description || (isAr ? "وجبة بدون اسم" : "Meal")}
                        </span>
                        {m.quantityGrams != null && m.quantityGrams > 0 && (
                          <span className="text-3xs text-foreground/60 px-1.5 py-0.5 rounded bg-card-hover font-semibold shrink-0">
                            {m.quantityGrams} {isAr ? "غرام" : "g"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-3xs text-foreground/70 shrink-0 ps-8 sm:ps-0 font-mono">
                        {m.calories != null && (
                          <span className="font-bold text-amber-500">
                            {m.calories} {isAr ? "سعرة" : "kcal"}
                          </span>
                        )}
                        {m.protein != null && (
                          <span className="text-blue-500 font-semibold">
                            P: {m.protein}g
                          </span>
                        )}
                        {m.carbs != null && (
                          <span className="text-emerald-500 font-semibold">
                            C: {m.carbs}g
                          </span>
                        )}
                        {m.fat != null && (
                          <span className="text-purple-500 font-semibold">
                            F: {m.fat}g
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Selected Day Details ("هاي التفاصيل") ── */}
      {selectedDate && (
        <div className="mt-4 pt-3 border-t border-border/70 space-y-3 animate-fade-in">
          {selectedMeals && selectedMeals.length > 0 ? (
            <div className="bg-background rounded-3xl p-4 sm:p-5 border border-border/90 shadow-sm space-y-3.5">
              {/* Day Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-black text-foreground">
                        {selectedDate}
                      </span>
                      <span className="text-3xs px-2.5 py-0.5 rounded-full bg-card-hover font-bold text-foreground/80 border border-border/60">
                        {selectedMeals.length} {isAr ? "أصناف" : "items"}
                      </span>
                    </div>
                    <span className="text-2xs text-foreground/60 font-semibold block mt-0.5">
                      {formatLongDate(selectedDate, isAr ? "ar" : "en-US")}
                    </span>
                  </div>
                </div>

                {/* Day Total Macros */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  {selectedTotals.totalCals > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center gap-1 font-mono">
                      <Flame className="w-3 h-3" />
                      <span>{selectedTotals.totalCals} {isAr ? "سعرة" : "kcal"}</span>
                    </span>
                  )}
                  {selectedTotals.totalProtein > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-500 font-mono">
                      {isAr ? "بروتين" : "Protein"}: {selectedTotals.totalProtein}g
                    </span>
                  )}
                  {selectedTotals.totalCarbs > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 font-mono">
                      {isAr ? "كارب" : "Carbs"}: {selectedTotals.totalCarbs}g
                    </span>
                  )}
                  {selectedTotals.totalFat > 0 && (
                    <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-500 font-mono">
                      {isAr ? "دهون" : "Fat"}: {selectedTotals.totalFat}g
                    </span>
                  )}
                </div>
              </div>

              {/* Food Items Cards */}
              <div className="space-y-2">
                {selectedMeals.map((m, mIdx) => (
                  <div
                    key={mIdx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-3.5 bg-card rounded-2xl border border-border/70 hover:border-accent/40 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                        <Utensils className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-black text-foreground text-sm block truncate">
                          {m.description || (isAr ? "وجبة بدون اسم" : "Meal")}
                        </span>
                        {m.quantityGrams != null && m.quantityGrams > 0 && (
                          <span className="text-3xs text-foreground/60 font-semibold mt-0.5 inline-block">
                            {m.quantityGrams} {isAr ? "غرام" : "g"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-2xs font-mono shrink-0 ps-10 sm:ps-0">
                      {m.calories != null && (
                        <span className="font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                          {m.calories} {isAr ? "سعرة" : "kcal"}
                        </span>
                      )}
                      {m.protein != null && (
                        <span className="text-blue-500 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-lg">
                          P: {m.protein}g
                        </span>
                      )}
                      {m.carbs != null && (
                        <span className="text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                          C: {m.carbs}g
                        </span>
                      )}
                      {m.fat != null && (
                        <span className="text-purple-500 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg">
                          F: {m.fat}g
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Empty state when selected day has no logged meals */
            <div className="p-6 text-center rounded-3xl bg-card border border-dashed border-border/80 space-y-2.5">
              <Utensils className="w-8 h-8 text-foreground/30 mx-auto" />
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {isAr
                  ? `لا توجد وجبات مسجلة بتاريخ ${selectedDate}`
                  : `No meals logged on ${selectedDate}`}
              </p>
              <p className="text-3xs text-foreground/60 max-w-sm mx-auto">
                {isAr
                  ? "لم يقم المتدرب بإدخال أي وجبات أو أطعمة في حاسبة السعرات لهذا اليوم."
                  : "The trainee did not log any food items in the meal calculator on this day."}
              </p>
              {loggedDates.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSelectDate(loggedDates[0])}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-card-hover hover:bg-muted text-foreground text-xs font-bold transition-all cursor-pointer mt-1 border border-border/80 shadow-2xs"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-accent" />
                  <span>
                    {isAr
                      ? `عرض آخر يوم مسجل (${loggedDates[0]})`
                      : `View latest logged day (${loggedDates[0]})`}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
