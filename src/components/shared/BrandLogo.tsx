"use client";

import { cn } from "@/lib/utils";
import { BRAND_CONFIG } from "@/lib/brandConfig";

export interface BrandLogoProps {
  variant?: "full" | "icon" | "text";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  subtext?: string;
  showSubtext?: boolean;
}

const SIZE_MAP = {
  xs: {
    icon: "w-6 h-6",
    title: "text-sm",
    subtext: "text-[10px]",
    containerGap: "gap-1.5",
  },
  sm: {
    icon: "w-8 h-8",
    title: "text-base",
    subtext: "text-2xs",
    containerGap: "gap-2",
  },
  md: {
    icon: "w-9 h-9",
    title: "text-lg",
    subtext: "text-xs",
    containerGap: "gap-2.5",
  },
  lg: {
    icon: "w-11 h-11",
    title: "text-2xl",
    subtext: "text-xs",
    containerGap: "gap-3",
  },
  xl: {
    icon: "w-16 h-16",
    title: "text-3xl sm:text-4xl",
    subtext: "text-sm",
    containerGap: "gap-3.5",
  },
};

/**
 * Geometric Vector Emblem for Nasaq Gym (نسق)
 * Represents rhythm, athletic progression, dynamic symmetry, and athletic power.
 */
export function NasaqIconMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-md shadow-primary/25 transition-transform duration-200 group-hover:scale-105",
        className
      )}
      style={{
        background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full p-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
      >
        <defs>
          <linearGradient id="nasaq-grad-inner" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="nasaq-glow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Dynamic Athletic Geometry - Bold Modern 'N' & Rhythm Wave */}
        {/* Left ascending pillar */}
        <path
          d="M22 76V24C22 21.7909 23.7909 20 26 20H32C34.2091 20 36 21.7909 36 24V60L64 24C65.5 22 67.5 20 70 20H74C76.2091 20 78 21.7909 78 24V76C78 78.2091 76.2091 80 74 80H68C65.7909 80 64 78.2091 64 76V40L36 76C34.5 78 32.5 80 30 80H26C23.7909 80 22 78.2091 22 76Z"
          fill="url(#nasaq-grad-inner)"
        />

        {/* Dynamic Power Slashes / Cadence Accents */}
        <path
          d="M48 44L56 34"
          stroke="url(#nasaq-glow)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle cx="50" cy="50" r="3.5" fill="#ffffff" opacity="0.95" />
      </svg>
    </div>
  );
}

/**
 * Unified Centralized Brand Logo Component
 * تعديل هذا المكوّن يُعدل الشعار في كل مكان في النظام
 */
export default function BrandLogo({
  variant = "full",
  size = "md",
  className,
  iconClassName,
  textClassName,
  subtext,
  showSubtext = false,
}: BrandLogoProps) {
  const currentSize = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div
      className={cn(
        "flex items-center select-none group",
        currentSize.containerGap,
        className
      )}
    >
      {/* Icon Mark */}
      {variant !== "text" && (
        <NasaqIconMark
          className={cn(currentSize.icon, iconClassName)}
        />
      )}

      {/* Brand Typography */}
      {variant !== "icon" && (
        <div className="flex flex-col min-w-0">
          <span
            className={cn(
              "font-black tracking-tight leading-none flex items-center gap-1",
              currentSize.title,
              textClassName
            )}
          >
            <span className="text-foreground">{BRAND_CONFIG.brandPrefix}</span>
            <span className="text-primary">{BRAND_CONFIG.brandSuffix}</span>
          </span>
          {showSubtext && (
            <span
              className={cn(
                "font-semibold text-foreground/70 tracking-normal mt-0.5 truncate",
                currentSize.subtext
              )}
            >
              {subtext || BRAND_CONFIG.nameAr}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
