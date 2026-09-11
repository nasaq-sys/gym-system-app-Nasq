"use client";

import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { formatLongDate } from "@/lib/format";
import { ShieldCheck, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DaysRingProps {
  daysLeft: number | null;
  totalDays: number | null;
  size?: number;
  strokeWidth?: number;
  expiredLabel?: string;
  planTitle?: string;
  endDate?: string;
  startDate?: string;
  interactive?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

export default function DaysRing({
  daysLeft,
  totalDays,
  size = 52,
  strokeWidth,
  expiredLabel,
  planTitle,
  endDate,
  startDate,
  interactive = true,
  showSubtitle = false,
  className,
}: DaysRingProps) {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const gradId = useId().replace(/:/g, "_");

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const defaultStroke = strokeWidth ?? Math.max(3, Math.round(size * 0.095));
  const expired = daysLeft !== null && daysLeft <= 0;

  // Authoritative dynamic calculation
  const safeTotal = totalDays != null && totalDays > 0 ? totalDays : (daysLeft ?? 30);
  const safeLeft = daysLeft != null ? Math.max(0, daysLeft) : 0;
  const fraction = expired
    ? 0
    : safeTotal > 0
      ? Math.min(Math.max(safeLeft / safeTotal, 0), 1)
      : 1;

  const daysElapsed = Math.max(0, safeTotal - safeLeft);

  const radius = (size - defaultStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = mounted ? circumference * (1 - fraction) : circumference;
  const center = size / 2;

  // Determine dynamic gradient color based on time left
  let gradStart = "var(--primary)";
  let gradEnd = "#f97316";
  let glowColor = "rgba(232, 98, 44, 0.35)";

  if (fraction <= 0.15 || (daysLeft != null && daysLeft <= 5)) {
    gradStart = "#ef4444";
    gradEnd = "#f87171";
    glowColor = "rgba(239, 68, 68, 0.4)";
  } else if (fraction <= 0.35 || (daysLeft != null && daysLeft <= 14)) {
    gradStart = "#f59e0b";
    gradEnd = "#fbbf24";
    glowColor = "rgba(245, 158, 11, 0.35)";
  } else {
    gradStart = "var(--primary)";
    gradEnd = "#fb923c";
    glowColor = "rgba(232, 98, 44, 0.35)";
  }

  // Typography scaling
  const numClass =
    size >= 140
      ? "text-4xl sm:text-5xl font-black"
      : size >= 90
        ? "text-2xl sm:text-3xl font-black"
        : size >= 60
          ? "text-base sm:text-lg font-black"
          : size >= 48
            ? "text-xs font-black"
            : "text-2xs font-extrabold";

  const expClass =
    size >= 140
      ? "text-2xl font-black"
      : size >= 90
        ? "text-lg font-bold"
        : size >= 52
          ? "text-2xs font-bold"
          : "text-[10px] font-bold";

  const defaultExpiredLabel = expiredLabel || (isAr ? "منتهي" : "Expired");

  const ringElement = (
    <div
      className={cn(
        "relative inline-flex flex-col items-center justify-center select-none",
        interactive && "cursor-pointer group",
        className
      )}
      aria-label={
        isAr
          ? `الاشتراك: متبقي ${daysLeft ?? 0} من ${safeTotal} يوم`
          : `Subscription: ${daysLeft ?? 0} of ${safeTotal} days left`
      }
    >
      <div
        className="relative inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-105 active:scale-95"
        style={{ width: size, height: size }}
        dir="ltr"
      >
        <svg
          width={size}
          height={size}
          className="-rotate-90 drop-shadow-sm"
          style={{ filter: mounted && !expired ? `drop-shadow(0 0 4px ${glowColor})` : undefined }}
        >
          <defs>
            <linearGradient id={`ring_grad_${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradStart} />
              <stop offset="100%" stopColor={gradEnd} />
            </linearGradient>
          </defs>

          {/* Background Track Circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={defaultStroke}
            opacity={0.35}
          />

          {/* Animated Dynamic Progress Ring */}
          {!expired && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`url(#ring_grad_${gradId})`}
              strokeWidth={defaultStroke}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-out"
            />
          )}
        </svg>

        {/* Center Content: Always shows remaining days count */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-0.5 pointer-events-none">
          {expired ? (
            <span className={cn("text-destructive leading-none", expClass)}>
              {defaultExpiredLabel}
            </span>
          ) : (
            <div className="flex flex-col items-center justify-center leading-none">
              <span className={cn("text-foreground tracking-tight tabular-nums", numClass)}>
                {daysLeft !== null ? daysLeft : "---"}
              </span>
            </div>
          )}
        </div>
      </div>

      {showSubtitle && !expired && (
        <span className="text-3xs font-bold text-foreground/70 tabular-nums mt-1 transition-colors group-hover:text-primary">
          {isAr ? "يوم متبقي" : "days left"}
        </span>
      )}
    </div>
  );

  if (!interactive || expired) {
    return ringElement;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex flex-col items-center justify-center bg-transparent border-none p-0 outline-hidden cursor-pointer">
        {ringElement}
      </PopoverTrigger>
      <PopoverContent
        align={isAr ? "end" : "start"}
        side="bottom"
        sideOffset={8}
        className="w-72 p-4 rounded-3xl bg-card/95 backdrop-blur-2xl border-primary/25 shadow-2xl shadow-black/40 text-start z-[9999]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground truncate">
              {planTitle || (isAr ? "بيانات الاشتراك" : "Subscription Details")}
            </span>
          </div>
          <span className="text-2xs font-extrabold px-2 py-0.5 rounded-md bg-primary/10 text-primary shrink-0 tabular-nums">
            {safeLeft} {isAr ? "يوم متبقي" : "days left"}
          </span>
        </div>

        {/* Interactive Progress Bar */}
        <div className="pt-2.5 pb-2 space-y-1.5">
          <div className="flex items-center justify-between text-2xs font-bold text-foreground/80">
            <span>{isAr ? "الأيام المتبقية:" : "Days remaining:"}</span>
            <span className="text-primary tabular-nums">
              {safeLeft} / {safeTotal} {isAr ? "يوم" : "days"}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden border border-border/40">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(5, Math.min(100, Math.round(fraction * 100)))}%`,
                background: `linear-gradient(90deg, ${gradStart}, ${gradEnd})`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-3xs text-foreground/60 pt-0.5">
            <span>{isAr ? `مضى ${daysElapsed} يوم` : `${daysElapsed}d elapsed`}</span>
            <span>{isAr ? `متبقي ${safeLeft} يوم` : `${safeLeft}d left`}</span>
          </div>
        </div>

        {/* Dates & Quick Summary */}
        <div className="pt-2 border-t border-border/40 space-y-1.5 text-2xs">
          {startDate && (
            <div className="flex items-center justify-between text-foreground/70">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-foreground/50" />
                {isAr ? "تاريخ البدء:" : "Start:"}
              </span>
              <span className="font-semibold text-foreground">{formatLongDate(startDate, locale)}</span>
            </div>
          )}
          {endDate && (
            <div className="flex items-center justify-between text-foreground/70">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-primary" />
                {isAr ? "تاريخ الانتهاء:" : "End Date:"}
              </span>
              <span className="font-semibold text-primary">{formatLongDate(endDate, locale)}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
