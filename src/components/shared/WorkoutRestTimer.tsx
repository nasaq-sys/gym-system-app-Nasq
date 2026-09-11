"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Timer,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkoutTimer } from "@/lib/WorkoutTimerProvider";
import { useI18n } from "@/hooks/useI18n";
import RestTimerSettingsModal from "./RestTimerSettingsModal";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function WorkoutRestTimer() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    isOpen,
    isMinimized,
    totalSeconds,
    remainingSeconds,
    isSoundEnabled,
    exerciseName,
    addSeconds,
    startPreset,
    stopRestTimer,
    toggleSound,
    setIsMinimized,
  } = useWorkoutTimer();

  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-collapse (minimize) when user clicks anywhere outside the card
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsMinimized(true);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen, isMinimized, setIsMinimized]);

  // Set body class so other elements can know rest timer is visible
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("rest-timer-open", isOpen);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("rest-timer-open");
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const percentage =
    totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;
  const isFinished = remainingSeconds <= 0;

  // Minimized Floating Pill View (Click anywhere on it to expand back!)
  if (isMinimized) {
    return (
      <>
        <div
          dir={isAr ? "rtl" : "ltr"}
          className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in zoom-in-95 duration-200"
        >
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className={cn(
              "h-12 px-4 rounded-full shadow-2xl border-2 flex items-center gap-3 backdrop-blur-xl transition-all cursor-pointer select-none",
              isFinished
                ? "bg-emerald-500 text-white border-emerald-300 animate-bounce shadow-emerald-500/40"
                : "bg-card/95 text-foreground border-primary/50 hover:border-primary shadow-primary/30 ring-2 ring-primary/20"
            )}
          >
            <div className="relative flex items-center justify-center">
              <Timer className={cn("w-5 h-5", isFinished ? "text-white" : "text-primary animate-spin")} />
              {!isFinished && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-ping" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tabular-nums tracking-wider">
                {isFinished ? (isAr ? "انتهت الراحة!" : "Rest Finished!") : formatTime(remainingSeconds)}
              </span>
              {exerciseName && (
                <span className="text-xs text-foreground/70 hidden sm:inline max-w-[120px] truncate">
                  ({exerciseName})
                </span>
              )}
            </div>
            <ChevronUp className="w-4 h-4 text-foreground/60" />
          </button>
        </div>
        <RestTimerSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    );
  }

  // Expanded Floating Card View
  return (
    <>
      <div
        dir={isAr ? "rtl" : "ltr"}
        ref={cardRef}
        className="fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[94%] max-w-md animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        <Card className="overflow-hidden border-2 border-primary/40 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/30 rounded-3xl ring-1 ring-primary/20">
          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* Header Row */}
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                  <Timer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-black text-sm text-foreground truncate">
                      {isAr ? "فترة الراحة بين الجولات" : "Rest Between Sets"}
                    </h4>
                    <Badge variant="secondary" className="text-3xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                      Live
                    </Badge>
                  </div>
                  {exerciseName && (
                    <p className="text-2xs text-foreground/70 truncate">{exerciseName}</p>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="w-8 h-8 rounded-lg text-foreground/70 hover:text-primary cursor-pointer"
                  title={isAr ? "إعدادات المؤقت والخلفية" : "Timer Settings"}
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSound}
                  className="w-8 h-8 rounded-lg text-foreground/70 hover:text-foreground cursor-pointer"
                  title={isSoundEnabled ? (isAr ? "كتم الصوت" : "Mute") : (isAr ? "تفعيل الصوت" : "Unmute")}
                >
                  {isSoundEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMinimized(true)}
                  className="w-8 h-8 rounded-lg text-foreground/70 hover:text-foreground cursor-pointer"
                  title={isAr ? "تصغير إلى زر عائم" : "Minimize"}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={stopRestTimer}
                  className="w-8 h-8 rounded-lg text-foreground/70 hover:text-destructive cursor-pointer"
                  title={isAr ? "إغلاق" : "Close"}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

          {/* Time & Progress Display */}
          <div className="text-center space-y-2 py-1">
            <div className="flex items-baseline justify-center gap-2">
              <span
                className={cn(
                  "text-4xl sm:text-5xl font-black tabular-nums tracking-wider",
                  isFinished ? "text-emerald-400 animate-pulse" : "text-foreground"
                )}
              >
                {formatTime(remainingSeconds)}
              </span>
              <span className="text-xs text-foreground/60 font-semibold">
                / {formatTime(totalSeconds)}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="relative pt-1">
              <Progress value={percentage} className="h-2.5 bg-muted rounded-full overflow-hidden" />
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {[30, 60, 90, 120].map((sec) => (
              <Button
                key={sec}
                variant={totalSeconds === sec ? "default" : "outline"}
                size="sm"
                onClick={() => startPreset(sec)}
                className={cn(
                  "h-8 text-xs font-bold rounded-xl transition-all",
                  totalSeconds === sec
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "bg-background/50 hover:bg-card-hover border-border/70"
                )}
              >
                {sec} {isAr ? "ث" : "s"}
              </Button>
            ))}
          </div>

          {/* Quick Adjustment & Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addSeconds(-15)}
              className="flex-1 h-9 rounded-xl font-bold text-xs gap-1 bg-background/60 border-border/70 hover:bg-card-hover"
            >
              <Minus className="w-3.5 h-3.5" />
              <span>15 {isAr ? "ثانية" : "s"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addSeconds(15)}
              className="flex-1 h-9 rounded-xl font-bold text-xs gap-1 bg-background/60 border-border/70 hover:bg-card-hover"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>15 {isAr ? "ثانية" : "s"}</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={stopRestTimer}
              className="flex-1 h-9 rounded-xl font-bold text-xs gap-1 bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-600/90 text-primary-foreground shadow-md shadow-primary/20"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isAr ? "إنهاء الراحة" : "Finish Rest"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    <RestTimerSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

