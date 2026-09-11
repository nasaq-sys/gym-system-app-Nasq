"use client";

import { useEffect, useState, useId } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface BodyFatZone {
  key: string;
  labelKey: string;
  from: number;
  to: number;
  color: string;
  bgBadge: string;
  textBadge: string;
}

export const BODY_FAT_ZONES: BodyFatZone[] = [
  { key: "lean", labelKey: "bodyFatGauge.zones.lean", from: 0, to: 10, color: "var(--info)", bgBadge: "bg-info/15 border-info/30", textBadge: "text-info" },
  { key: "healthy", labelKey: "bodyFatGauge.zones.healthy", from: 10, to: 20, color: "var(--success)", bgBadge: "bg-success/15 border-success/30", textBadge: "text-success" },
  { key: "overweight", labelKey: "bodyFatGauge.zones.overweight", from: 20, to: 30, color: "var(--warning)", bgBadge: "bg-warning/15 border-warning/30", textBadge: "text-warning" },
  { key: "danger", labelKey: "bodyFatGauge.zones.danger", from: 30, to: 40, color: "var(--destructive)", bgBadge: "bg-destructive/15 border-destructive/30", textBadge: "text-destructive" },
];

export const BODY_FAT_SCALE_MAX = 40;

export function bodyFatZone(pct: number): BodyFatZone {
  for (const z of BODY_FAT_ZONES) {
    if (pct >= z.from && pct < z.to) return z;
  }
  return BODY_FAT_ZONES[BODY_FAT_ZONES.length - 1];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export interface BodyFatHistoryPoint {
  date: string;
  bodyFat: number;
}

interface BodyFatGaugeProps {
  bodyFatPercent: number | null;
  history?: BodyFatHistoryPoint[];
  className?: string;
}

const CX = 120;
const CY = 115;
const R = 82;
const STROKE_WIDTH = 18;

export default function BodyFatGauge({
  bodyFatPercent,
  className,
}: BodyFatGaugeProps) {
  const { t } = useI18n();
  const [animated, setAnimated] = useState(false);
  const rawId = useId();
  const gradId = `bf-grad-${rawId.replace(/:/g, "")}`;

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const bf =
    bodyFatPercent != null ? Number((bodyFatPercent * 100).toFixed(1)) : null;
  const display =
    bf != null
      ? `${Number.isInteger(bf) ? String(bf) : bf.toFixed(1)}%`
      : "---";
  const zone = bf != null ? bodyFatZone(bf) : null;

  // Calculate needle target angle in degrees (180deg = Left / 0%, 0deg = Right / 40%)
  const targetAngle = bf != null ? 180 - clamp(bf / BODY_FAT_SCALE_MAX, 0, 1) * 180 : 180;
  const currentAngle = animated ? targetAngle : 180;
  const rad = (currentAngle * Math.PI) / 180;
  const needleX = CX + (R - 2) * Math.cos(rad);
  const needleY = CY - (R - 2) * Math.sin(rad);

  const startX = CX - R;
  const endX = CX + R;

  return (
    <Card className={cn("overflow-hidden p-5 flex flex-col justify-between shadow-sm", className)}>
      <CardHeader
        title={t("bodyFatGauge.title") || "مؤشر دهون الجسم"}
        action={
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 font-bold",
              zone
                ? `${zone.bgBadge} ${zone.textBadge}`
                : "bg-muted/40 text-foreground/70 border-border"
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: zone ? zone.color : "currentColor" }}
            />
            <span>{zone ? t(zone.labelKey) : t("bodyFatGauge.noData")}</span>
          </Badge>
        }
      />

      {/* ── Semicircle Speedometer with Rounded Ends & Vivid Gradient ── */}
      <div className="flex flex-col items-center justify-center pt-2 flex-1 min-w-0">
        <div className="relative w-full max-w-[240px] flex justify-center">
          <svg
            viewBox="0 0 240 135"
            className="w-full h-auto overflow-visible"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={startX}
                y1={CY}
                x2={endX}
                y2={CY}
              >
                <stop offset="0%" stopColor="var(--info)" stopOpacity="1" />
                <stop offset="28%" stopColor="var(--success)" stopOpacity="1" />
                {/* No existing theme token sits between --success and --warning on the
                    health-risk scale; this intermediate stop is a deliberate exception
                    (flagged) rather than a guessed token. */}
                <stop offset="55%" stopColor="#84cc16" stopOpacity="1" />
                <stop offset="75%" stopColor="var(--warning)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--destructive)" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Background Track Arc with Rounded Caps */}
            <path
              d={`M ${startX} ${CY} A ${R} ${R} 0 0 1 ${endX} ${CY}`}
              stroke="var(--border)"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
            />

            {/* Gradient Arc with Perfect Rounded Caps */}
            <path
              d={`M ${startX} ${CY} A ${R} ${R} 0 0 1 ${endX} ${CY}`}
              stroke={`url(#${gradId})`}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
            />

            {/* Animated Needle Line */}
            {bf != null && (
              <line
                x1={CX}
                y1={CY}
                x2={needleX}
                y2={needleY}
                stroke="var(--foreground)"
                strokeWidth="3.5"
                strokeLinecap="round"
                style={{
                  transition: "all 1s cubic-bezier(0.34, 1.2, 0.64, 1)",
                }}
              />
            )}

            {/* Center Pivot Circle */}
            <circle cx={CX} cy={CY} r="6" fill="var(--foreground)" />
            <circle cx={CX} cy={CY} r="2.5" fill="var(--card)" />
          </svg>
        </div>

        {/* ── Numeric Value Display ── */}
        <div className="text-center mt-2">
          <p className="text-3xl sm:text-4xl font-black tabular-nums text-foreground tracking-tight">
            {display}
          </p>
          <p className="text-xs font-bold text-foreground/70 mt-0.5">
            {t("bodyFatGauge.bodyFat") || "نسبة الدهون المقاسة"}
          </p>
        </div>

        {/* ── 4 Zones Color Legend (Lean, Healthy, Overweight, Danger) ── */}
        <div
          dir="ltr"
          className="mt-3 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 pt-2.5 border-t border-border/60 w-full"
        >
          {BODY_FAT_ZONES.map((z) => (
            <span key={z.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: z.color }}
              />
              <span className="text-3xs sm:text-2xs text-foreground/70 font-bold">
                {t(z.labelKey)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
