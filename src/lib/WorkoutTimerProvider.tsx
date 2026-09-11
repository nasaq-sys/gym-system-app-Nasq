"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { playBeep, playSuccessChime, triggerVibrate } from "./soundUtils";
import {
  ActiveRestTimer,
  RestTimerSettings,
  REST_TIMER_STORAGE_KEY,
  createRestTimer,
  adjustTimerDuration,
  calculateRemainingSeconds,
  deserializeRestTimer,
  DEFAULT_REST_TIMER_SETTINGS,
} from "./workoutTimerEngine";
import { NativeTimerBridge } from "./nativeTimerBridge";

export type StartTimerOptions =
  | number
  | {
      durationSeconds?: number;
      seconds?: number;
      exerciseName?: string;
      exerciseId?: string;
      workoutId?: string;
      userId?: string;
      startedAt?: number;
      endsAt?: number;
      status?: string;
    };

interface WorkoutTimerContextType {
  isOpen: boolean;
  isActive: boolean;
  isMinimized: boolean;
  totalSeconds: number;
  remainingSeconds: number;
  isSoundEnabled: boolean;
  exerciseName?: string;
  activeTimer: ActiveRestTimer | null;
  settings: RestTimerSettings;
  startRestTimer: (secondsOrOptions?: StartTimerOptions, exName?: string) => void;
  addSeconds: (delta: number) => void;
  startPreset: (seconds: number) => void;
  stopRestTimer: () => void;
  toggleSound: () => void;
  setIsMinimized: (val: boolean) => void;
  updateSettings: (newSettings: Partial<RestTimerSettings>) => void;
  cleanupOnLogout: () => void;
}

const WorkoutTimerContext = createContext<WorkoutTimerContextType | undefined>(undefined);

export function WorkoutTimerProvider({ children }: { children: React.ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<ActiveRestTimer | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(60);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [exerciseName, setExerciseName] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<RestTimerSettings>(DEFAULT_REST_TIMER_SETTINGS);

  const activeTimerRef = useRef<ActiveRestTimer | null>(null);
  const settingsRef = useRef<RestTimerSettings>(DEFAULT_REST_TIMER_SETTINGS);
  const hasFinishedAlertedRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    activeTimerRef.current = activeTimer;
  }, [activeTimer]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Request notification permission smoothly when first starting a timer
  const ensureNotificationPermission = () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  const sendFinishedNotification = useCallback((exName?: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const title = "انتهت فترة الراحة! ⏱️";
    const body = exName
      ? `حان وقت الجولة التالية في تمرين: ${exName}`
      : "حان وقت الجولة التالية في تمرينك!";

    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            tag: "rest-timer-finished",
          }).catch(() => {
            new Notification(title, { body, icon: "/icons/icon-192x192.png" });
          });
        }).catch(() => {
          new Notification(title, { body, icon: "/icons/icon-192x192.png" });
        });
      } else {
        new Notification(title, { body, icon: "/icons/icon-192x192.png" });
      }
    } catch {
      // ignore
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration of client-only timer and settings from storage on mount */
  useEffect(() => {
    try {
      const savedSettings = NativeTimerBridge.loadSavedSettings();
      setSettings(savedSettings);

      const savedRaw = localStorage.getItem(REST_TIMER_STORAGE_KEY);
      const parsedTimer = deserializeRestTimer(savedRaw);

      if (parsedTimer && parsedTimer.endsAt > Date.now()) {
        const left = calculateRemainingSeconds(parsedTimer.endsAt);
        setActiveTimer(parsedTimer);
        setTotalSeconds(parsedTimer.durationSeconds || 60);
        setRemainingSeconds(left);
        setIsActive(true);
        setIsOpen(true);
        setExerciseName(parsedTimer.exerciseName);
      } else {
        localStorage.removeItem(REST_TIMER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */


  /**
   * Starts rest timer immediately (<10ms UI update) and dispatches to native surfaces.
   */
  const startRestTimer = useCallback((secondsOrOptions: StartTimerOptions = 60, exName?: string) => {
    ensureNotificationPermission();
    let seconds = 60;
    let name = exName;
    let exerciseId = "active_exercise";
    let workoutId = "active_workout";
    let userId = "anonymous";

    if (typeof secondsOrOptions === "object" && secondsOrOptions !== null) {
      seconds = secondsOrOptions.durationSeconds ?? secondsOrOptions.seconds ?? 60;
      name = secondsOrOptions.exerciseName ?? exName;
      exerciseId = secondsOrOptions.exerciseId ?? exerciseId;
      workoutId = secondsOrOptions.workoutId ?? workoutId;
      userId = secondsOrOptions.userId ?? userId;
    } else if (typeof secondsOrOptions === "number") {
      seconds = secondsOrOptions;
    }

    const newTimer = createRestTimer({
      durationSeconds: seconds,
      exerciseName: name,
      exerciseId,
      workoutId,
      userId,
    });

    hasFinishedAlertedRef.current = false;
    activeTimerRef.current = newTimer;
    setActiveTimer(newTimer);
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsActive(true);
    setIsOpen(true);
    setIsMinimized(false);
    setExerciseName(name);

    // Synchronize with Native Background Service / LocalStorage
    NativeTimerBridge.startTimer(newTimer, settingsRef.current);
  }, []);

  /**
   * Adjusts duration (+15s, -15s) and broadcasts update.
   */
  const addSeconds = useCallback((delta: number) => {
    const current = activeTimerRef.current;
    if (!current) return;

    const updated = adjustTimerDuration(current, delta);
    const newLeft = calculateRemainingSeconds(updated.endsAt);

    activeTimerRef.current = updated;
    setActiveTimer(updated);
    setRemainingSeconds(newLeft);
    setTotalSeconds((prev) => Math.max(prev, newLeft));
    setIsActive(newLeft > 0);
    hasFinishedAlertedRef.current = false;

    NativeTimerBridge.updateTimer(updated);
  }, []);

  const startPreset = useCallback((seconds: number) => {
    startRestTimer(seconds, exerciseName);
  }, [exerciseName, startRestTimer]);

  /**
   * Stops/cancels timer and removes all native background surfaces.
   */
  const stopRestTimer = useCallback(() => {
    const currentId = activeTimerRef.current?.id;
    activeTimerRef.current = null;
    setActiveTimer(null);
    setIsActive(false);
    setIsOpen(false);
    setIsMinimized(false);
    hasFinishedAlertedRef.current = false;

    NativeTimerBridge.stopTimer(currentId);
  }, []);

  const toggleSound = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, soundEnabled: !prev.soundEnabled };
      NativeTimerBridge.syncSettings(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((newSettings: Partial<RestTimerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...newSettings };
      NativeTimerBridge.syncSettings(next);
      return next;
    });
  }, []);

  /**
   * Complete teardown on user logout.
   */
  const cleanupOnLogout = useCallback(() => {
    stopRestTimer();
    try {
      localStorage.removeItem(REST_TIMER_STORAGE_KEY);
    } catch {}
  }, [stopRestTimer]);

  // Main countdown loop based strictly on absolute timestamps
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isOpen && isActive && activeTimer?.endsAt) {
      const tick = () => {
        const current = activeTimerRef.current;
        if (!current || !current.endsAt) return;

        const left = calculateRemainingSeconds(current.endsAt);

        if (left > 0) {
          setRemainingSeconds(left);
          if (left === 3 || left === 2 || left === 1) {
            playBeep(settingsRef.current.soundEnabled, 700, 0.08);
          }
        } else {
          setRemainingSeconds(0);
          setIsActive(false);
          activeTimerRef.current = null;
          setActiveTimer(null);

          try {
            localStorage.removeItem(REST_TIMER_STORAGE_KEY);
          } catch {}

          if (!hasFinishedAlertedRef.current) {
            hasFinishedAlertedRef.current = true;
            playSuccessChime(settingsRef.current.soundEnabled);
            if (settingsRef.current.vibrationEnabled) {
              triggerVibrate([200, 100, 200, 100, 300]);
            }

            // If app is backgrounded or screen locked, notify user!
            if (typeof document !== "undefined" && document.visibilityState !== "visible") {
              sendFinishedNotification(current.exerciseName);
            }
          }

          NativeTimerBridge.stopTimer(current.id);
        }
      };

      tick();
      interval = setInterval(tick, 500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOpen, isActive, activeTimer?.endsAt, sendFinishedNotification]);

  // Visibility and focus change reconciliation (recovering from lock screen / background)
  useEffect(() => {
    const handleReconciliation = () => {
      const current = activeTimerRef.current;
      if (current && current.endsAt) {
        const left = calculateRemainingSeconds(current.endsAt);
        if (left <= 0) {
          setRemainingSeconds(0);
          setIsActive(false);
          activeTimerRef.current = null;
          setActiveTimer(null);

          if (!hasFinishedAlertedRef.current) {
            hasFinishedAlertedRef.current = true;
            playSuccessChime(settingsRef.current.soundEnabled);
            if (settingsRef.current.vibrationEnabled) {
              triggerVibrate([200, 100, 200, 100, 300]);
            }
          }
          NativeTimerBridge.stopTimer(current.id);
        } else {
          setRemainingSeconds(left);
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleReconciliation);
      window.addEventListener("focus", handleReconciliation);
      window.addEventListener("pageshow", handleReconciliation);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleReconciliation);
        window.removeEventListener("focus", handleReconciliation);
        window.removeEventListener("pageshow", handleReconciliation);
      }
    };
  }, []);

  return (
    <WorkoutTimerContext.Provider
      value={{
        isOpen,
        isActive,
        isMinimized,
        totalSeconds,
        remainingSeconds,
        isSoundEnabled: settings.soundEnabled,
        exerciseName,
        activeTimer,
        settings,
        startRestTimer,
        addSeconds,
        startPreset,
        stopRestTimer,
        toggleSound,
        setIsMinimized,
        updateSettings,
        cleanupOnLogout,
      }}
    >
      {children}
    </WorkoutTimerContext.Provider>
  );
}

export function useWorkoutTimer() {
  const ctx = useContext(WorkoutTimerContext);
  if (!ctx) {
    throw new Error("useWorkoutTimer must be used within a WorkoutTimerProvider");
  }
  return ctx;
}
