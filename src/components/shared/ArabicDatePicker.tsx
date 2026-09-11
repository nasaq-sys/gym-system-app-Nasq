"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, X, Sparkles } from "lucide-react";
import { arEG } from "date-fns/locale/ar-EG";
import { enUS } from "date-fns/locale/en-US";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

interface ArabicDatePickerProps {
  value: string;
  onChange: (dateStr: string) => void;
  label?: string;
  placeholder?: string;
  maxDate?: string;
  className?: string;
  disabled?: boolean;
}

function toIsoString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(dateStr: string): Date | undefined {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDisplayDate(dateStr: string, isAr: boolean): string {
  const d = parseIsoDate(dateStr);
  if (!d) return "";

  const todayStr = toIsoString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toIsoString(yesterday);
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = toIsoString(twoDaysAgo);

  const formattedDate = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);

  if (dateStr === todayStr) {
    return isAr ? `اليوم (${formattedDate})` : `Today (${formattedDate})`;
  }
  if (dateStr === yesterdayStr) {
    return isAr ? `أمس (${formattedDate})` : `Yesterday (${formattedDate})`;
  }
  if (dateStr === twoDaysAgoStr) {
    return isAr ? `قبل يومين (${formattedDate})` : `2 Days Ago (${formattedDate})`;
  }
  return formattedDate;
}

export default function ArabicDatePicker({
  value,
  onChange,
  label,
  placeholder,
  maxDate,
  className,
  disabled = false,
}: ArabicDatePickerProps) {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);

  const defaultPlaceholder = isAr
    ? "اختر تاريخ الفقدان أو العثور..."
    : "Select date...";

  const today = new Date();
  const todayStr = toIsoString(today);
  const effectiveMaxDate = maxDate || todayStr;
  const effectiveMaxDateObj = parseIsoDate(effectiveMaxDate) ?? today;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toIsoString(yesterday);

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = toIsoString(twoDaysAgo);

  const selectedDate = parseIsoDate(value);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(toIsoString(date));
    setOpen(false);
  };

  const handleQuickSelect = (dateStr: string) => {
    onChange(dateStr);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-xs font-bold text-foreground">
          {label}
        </label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-between h-10 px-3.5 text-xs sm:text-sm font-normal text-start cursor-pointer",
            !value && "text-foreground/70",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">
              {value
                ? formatDisplayDate(value, isAr)
                : placeholder || defaultPlaceholder}
            </span>
          </span>

          {value ? (
            <span
              role="button"
              onClick={handleClear}
              className="p-1 rounded-full hover:bg-muted/80 text-foreground/70 hover:text-foreground transition-colors"
              title={isAr ? "مسح التاريخ" : "Clear date"}
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : null}
        </PopoverTrigger>

        <PopoverContent
          className="w-auto p-3.5 text-foreground bg-card border border-border/80 shadow-2xl rounded-3xl"
          align="start"
        >
          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 pb-2.5 mb-2 border-b border-border/60">
            <span className="text-2xs font-bold text-foreground/70 flex items-center gap-1 ps-1">
              <Sparkles className="w-3 h-3 text-primary" />
              <span>{isAr ? "سريع:" : "Quick:"}</span>
            </span>
            <Button
              type="button"
              variant={value === todayStr ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5 flex-1 rounded-xl font-bold transition-all",
                value === todayStr
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 hover:border-primary/40 hover:bg-muted/50"
              )}
              onClick={() => handleQuickSelect(todayStr)}
            >
              {isAr ? "اليوم" : "Today"}
            </Button>
            <Button
              type="button"
              variant={value === yesterdayStr ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5 flex-1 rounded-xl font-bold transition-all",
                value === yesterdayStr
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 hover:border-primary/40 hover:bg-muted/50"
              )}
              onClick={() => handleQuickSelect(yesterdayStr)}
            >
              {isAr ? "أمس" : "Yesterday"}
            </Button>
            <Button
              type="button"
              variant={value === twoDaysAgoStr ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5 flex-1 rounded-xl font-bold transition-all",
                value === twoDaysAgoStr
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 hover:border-primary/40 hover:bg-muted/50"
              )}
              onClick={() => handleQuickSelect(twoDaysAgoStr)}
            >
              {isAr ? "قبل يومين" : "2 Days Ago"}
            </Button>
          </div>

          <Calendar
            mode="single"
            locale={isAr ? arEG : enUS}
            selected={selectedDate}
            defaultMonth={selectedDate ?? effectiveMaxDateObj}
            onSelect={handleSelect}
            disabled={{ after: effectiveMaxDateObj }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
