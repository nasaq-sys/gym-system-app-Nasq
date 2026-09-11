"use client";

import { useTheme, type Theme } from "@/lib/ThemeProvider";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { Moon, Sun, Laptop } from "lucide-react";

interface ThemeSwitchProps {
  className?: string;
  showLabels?: boolean;
  size?: "sm" | "md";
}

export default function ThemeSwitch({
  className,
  showLabels = false,
  size = "md",
}: ThemeSwitchProps) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const options: Array<{ value: Theme; label: string; icon: typeof Moon }> = [
    { value: "dark", label: t("common.theme.dark"), icon: Moon },
    { value: "light", label: t("common.theme.light"), icon: Sun },
    { value: "system", label: t("common.theme.system"), icon: Laptop },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border select-none",
        className
      )}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all cursor-pointer",
              size === "sm"
                ? "px-2 py-1 text-xs"
                : showLabels
                ? "px-3 py-1.5 text-xs flex-1"
                : "w-8 h-8",
              isActive
                ? "bg-primary text-primary-foreground shadow-xs scale-[1.02]"
                : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
            {showLabels && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
