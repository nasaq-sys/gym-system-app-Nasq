"use client";

import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";

interface LanguageSwitchProps {
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export default function LanguageSwitch({
  className,
  showIcon = false,
  size = "md",
}: LanguageSwitchProps) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border select-none",
        className
      )}
      dir="ltr"
    >
      {showIcon && (
        <span className="ps-1.5 pe-0.5 text-foreground/70">
          <Globe className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        </span>
      )}
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={cn(
          "rounded-lg font-bold transition-all cursor-pointer",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
          locale === "ar"
            ? "bg-primary text-primary-foreground shadow-xs scale-[1.02]"
            : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
        )}
      >
        AR
      </button>

      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-lg font-bold transition-all cursor-pointer",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
          locale === "en"
            ? "bg-primary text-primary-foreground shadow-xs scale-[1.02]"
            : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
        )}
      >
        EN
      </button>
    </div>
  );
}
