"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  TrendingUp,
  Flame,
  X,
  Calendar,
  Trash2,
  Pencil,
  Link as LinkIcon,
  Search,
  UserCog,
  Palmtree,
  AlertTriangle,
  Timer,
  Volume2,
  VolumeX,
  RotateCcw,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { weekdayFullLabels } from "@/lib/format";
import { useWakeLock } from "@/lib/wakeLock";
import { useWorkoutTimer } from "@/lib/WorkoutTimerProvider";
import { clientFetch, getClientCachedData, invalidateClientCache } from "@/lib/clientCache";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const workoutChartTheme = {
  line: "#2563EB",
  lineSecondary: "#38BDF8",
  pointFill: "#2563EB",
  pointBorder: "#BAE6FD",
  activePoint: "#1D4ED8",
  axisText: "#AFAFAF",
  axisValue: "#C8C8C8",
  grid: "rgba(255, 255, 255, 0.10)",
  tooltipBackground: "#1E293B",
  tooltipBorder: "rgba(37, 99, 235, 0.45)",
  tooltipPrimaryText: "#FFFFFF",
  tooltipSecondaryText: "#C8C8C8",
};

// The heaviest raw deadlift ever recorded is ~501kg (Hafþór Björnsson) —
// nothing a human logs here should realistically exceed that, so 500kg is
// the practical ceiling for a single set. Anything above it is almost
// certainly a typo, not a real lift. Kept in sync with weightLogSchema.ts's
// server-side max (the actual enforced limit; this is just the matching
// client-side check so the input can show an inline error immediately
// instead of only failing silently after a round trip to the API).
const MAX_WEIGHT_KG = 500;

// ── Types ──
interface ExerciseLog {
  weight: number;
  reps: number;
  sets: number;
  date: string;
  sessionNotes: string;
}

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  latest: ExerciseLog | null;
  history: ExerciseLog[];
}

// A single exercise within a day's plan — linked to the real exercise
// library record (exerciseId) rather than matched by name text, so the
// weight log below can never fail to find it.
interface ScheduleItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  repsSets: string;
  reps: number | null;
  sets: number | null;
}

interface ScheduleEntry {
  id: string;
  planName: string;
  targetDay: string;
  items: ScheduleItem[];
}

// ── Day mapping ──
// Day 1..7 are just labels now — which real weekday each one lands on is
// personalized per member via `anchorDay` (the weekday their latest
// subscription started on), not a fixed Sunday-first mapping.
const DAY_KEYS = [
  { ar: "اليوم الاول", en: "Day 1" },
  { ar: "اليوم الثاني", en: "Day 2" },
  { ar: "اليوم الثالث", en: "Day 3" },
  { ar: "اليوم الرابع", en: "Day 4" },
  { ar: "اليوم الخامس", en: "Day 5" },
  { ar: "اليوم السادس", en: "Day 6" },
  { ar: "اليوم السابع", en: "Day 7" },
];

function getTodayIndex() {
  return new Date().getDay();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Library exercise names carry an English translation in parens, e.g.
// "السحب الأمامي على الجهاز (Lat Pulldown)" — full data is kept as-is (and
// still what's stored/matched), but rendering the Latin half inline with
// Arabic text triggers bidi reordering that made names clip mid-word in
// narrow cards. Display-only: strips a trailing "(...)" made of non-Arabic
// characters so what's shown stays short and single-direction.
function displayExerciseName(name: string): string {
  return name.replace(/\s*\([^)؀-ۿ]*\)\s*$/, "").trim() || name;
}

interface DayWorkoutSession {
  date: string;
  maxWeight: number;
  minWeight: number;
  latestWeight: number;
  totalSets: number;
  sets: ExerciseLog[];
}

function groupHistoryByDay(history: ExerciseLog[]): DayWorkoutSession[] {
  const map = new Map<string, ExerciseLog[]>();
  for (const log of history) {
    const d = log.date ? log.date.slice(0, 10) : "";
    if (!d) continue;
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(log);
  }

  const result: DayWorkoutSession[] = [];

  for (const [date, logs] of map.entries()) {
    // Sort sets chronologically ascending (Set 1, Set 2, Set 3)
    const sortedSets = [...logs].sort((a, b) => {
      if (a.sets && b.sets && a.sets !== b.sets) return a.sets - b.sets;
      const mA = a.sessionNotes?.match(/الجولة\s*(\d+)/);
      const mB = b.sessionNotes?.match(/الجولة\s*(\d+)/);
      if (mA && mB) return parseInt(mA[1], 10) - parseInt(mB[1], 10);
      return 0;
    });

    const weights = logs
      .map((l) => l.weight)
      .filter((w) => typeof w === "number" && !isNaN(w));
    const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
    const minWeight = weights.length > 0 ? Math.min(...weights) : 0;
    const latestSet = sortedSets[sortedSets.length - 1];

    result.push({
      date,
      maxWeight,
      minWeight,
      latestWeight: latestSet ? latestSet.weight : maxWeight,
      totalSets: logs.length,
      sets: sortedSets,
    });
  }

  // Sort newest date first
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

function extractUserNote(notes?: string): string {
  if (!notes) return "";
  const trimmed = notes.trim();
  const match = trimmed.match(/^الجولة\s*\d+:[^(]*\((.*)\)$/);
  if (match && match[1]) return match[1].trim();
  if (/^الجولة\s*\d+:\s*[\d.]+\s*kg\s*×\s*\d+\s*تكرار$/i.test(trimmed)) return "";
  return trimmed;
}

export default function WorkoutsPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  // Full Sun→Sat weekday names for the day-selector chips (locale-aware via
  // Intl) — replaces the old single-letter abbreviations.
  const weekdayNames = useMemo(() => weekdayFullLabels(locale), [locale]);

  // ── Wake Lock Hook ──
  const wakeLock = useWakeLock(false);

  // ── Global Rest Timer Hook ──
  const {
    startRestTimer,
    stopRestTimer,
    isOpen: restTimerOpen,
    isActive: restTimerActive,
  } = useWorkoutTimer();

  // ── Exercise Log State ──
  const [exercises, setExercises] = useState<Exercise[]>(() => getClientCachedData<Exercise[]>("/api/workouts/exercises") || []);
  const [loading, setLoading] = useState(() => !getClientCachedData("/api/workouts/exercises"));
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which exercises have their history list expanded past the default 5
  // most-recent entries — otherwise a routine you log every week just keeps
  // growing into one long undifferentiated list.
  const [historyShowAll, setHistoryShowAll] = useState<Set<string>>(new Set());
  const [expandedDaySessions, setExpandedDaySessions] = useState<Set<string>>(new Set());
  const activeCardRef = useRef<HTMLDivElement | null>(null);

  const toggleDaySession = useCallback((sessionKey: string) => {
    setExpandedDaySessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionKey)) next.delete(sessionKey);
      else next.add(sessionKey);
      return next;
    });
  }, []);

  const [filterGroup, setFilterGroup] = useState("all");
  const [logExerciseId, setLogExerciseId] = useState<string | null>(null);
  const [logWeight, setLogWeight] = useState("");
  const [logReps, setLogReps] = useState("");
  const [logSets, setLogSets] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logError, setLogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  // ── Focus Mode (Hybrid 1c) State ──
  const [focusMode, setFocusMode] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [focusW, setFocusW] = useState(60);
  const [focusR, setFocusR] = useState(10);
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);
  const [completedSetsMap, setCompletedSetsMap] = useState<Record<string, number>>({});
  const [completedSetDetailsMap, setCompletedSetDetailsMap] = useState<
    Record<string, Record<number, { weight: number; reps: number }>>
  >({});
  const [isSubmittingSet, setIsSubmittingSet] = useState(false);
  const isSubmittingSetRef = useRef(false);

  // ── Schedule State ──
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(() => getClientCachedData<any>("/api/workouts/schedules")?.schedules || []);
  const [managedByTrainer, setManagedByTrainer] = useState(false);
  const [anchorDay, setAnchorDay] = useState(0);
  const [selectedDay, setSelectedDayState] = useState(getTodayIndex());
  const hasUserPickedDay = useRef(false);
  const setSelectedDay = (idx: number) => {
    hasUserPickedDay.current = true;
    setSelectedDayState(idx);
  };
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schedDetails, setSchedDetails] = useState<
    Record<string, { reps: string; sets: string }>
  >({});
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedSaved, setSchedSaved] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showVacationConfirm, setShowVacationConfirm] = useState(false);
  const [vacationSaving, setVacationSaving] = useState(false);
  const [vacationDone, setVacationDone] = useState<boolean | null>(null);
  const [schedPickerQuery, setSchedPickerQuery] = useState("");

  // ── Fetch Exercises ──
  const fetchExercises = useCallback((forceRefresh = false) => {
    clientFetch<Exercise[]>("/api/workouts/exercises", undefined, {
      ttlMs: 60000,
      forceRefresh,
    })
      .then((data) => {
        if (Array.isArray(data)) setExercises(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Fetch Schedules ──
  const fetchSchedules = useCallback((forceRefresh = false) => {
    clientFetch<{ success?: boolean; data?: ScheduleEntry[]; managedByTrainer?: boolean; anchorDay?: number }>(
      "/api/workouts/schedules",
      undefined,
      { ttlMs: 60000, forceRefresh }
    )
      .then((res: any) => {
        const schedList = Array.isArray(res) ? res : res?.data || [];
        if (Array.isArray(schedList)) setSchedules(schedList);
        if (res?.managedByTrainer !== undefined) setManagedByTrainer(Boolean(res.managedByTrainer));
        if (typeof res?.anchorDay === "number") {
          setAnchorDay(res.anchorDay);
          if (!hasUserPickedDay.current) {
            const real = getTodayIndex();
            setSelectedDayState(((real - res.anchorDay) % 7 + 7) % 7);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchExercises();
    fetchSchedules();
  }, [fetchExercises, fetchSchedules]);

  // ── Session live timer in Focus Mode ──
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (focusMode) {
      timer = setInterval(() => {
        setSessionElapsedSec((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [focusMode]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // ── Deep link support: /workouts?focus=log scrolls to the weight log ──
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") !== "log") return;
    const t = setTimeout(() => {
      document.getElementById("weight-log")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // ── Schedule helpers ──
  const todayIdx = ((getTodayIndex() - anchorDay) % 7 + 7) % 7;
  const isSelectedToday = selectedDay === todayIdx;

  // Days that have at least one exercise with recorded weights
  const daysWithLogs = useMemo(() => {
    const result = new Set<number>();
    DAY_KEYS.forEach((dayKey, idx) => {
      const daySched = schedules.filter((s) => s.targetDay === dayKey.ar);
      const hasLog = daySched.some((s) =>
        s.items.some((item) => {
          const ex = exercises.find((e) => e.id === item.exerciseId);
          return ex && ex.latest != null;
        })
      );
      if (hasLog) result.add(idx);
    });
    return result;
  }, [schedules, exercises]);

  // ── Routine & Session Derivations for Hybrid Mode ──
  const todaySchedules = useMemo(
    () => schedules.filter((s) => s.targetDay === DAY_KEYS[selectedDay].ar),
    [schedules, selectedDay]
  );

  const currentSplitName = useMemo(() => {
    return todaySchedules[0]?.planName || (isAr ? `تمرين ${DAY_KEYS[selectedDay].ar}` : `Day ${selectedDay + 1} Workout`);
  }, [todaySchedules, selectedDay, isAr]);

  // On a day with no scheduled plan, return empty so it properly acts as a Rest Day
  const activeSessionExercises = useMemo(() => {
    if (todaySchedules.length > 0 && todaySchedules[0].items.length > 0) {
      return todaySchedules[0].items.map((item) => {
        const found = exercises.find((e) => e.id === item.exerciseId);
        return {
          id: item.exerciseId,
          scheduleItemId: item.id,
          name: found ? found.name : item.exerciseName,
          muscleGroup: found ? found.muscleGroup : (isAr ? "عام" : "General"),
          prescribed:
            item.reps != null && item.sets != null
              ? `${item.sets} × ${item.reps}`
              : item.repsSets || "3 × 10",
          targetReps: item.reps || 10,
          targetSets: item.sets || 3,
          latest: found?.latest || null,
          history: found?.history || [],
        };
      });
    }
    return [];
  }, [todaySchedules, exercises, isAr]);

  const totalPrescribedSets = useMemo(() => {
    return activeSessionExercises.reduce((acc, ex) => acc + (ex.targetSets || 3), 0);
  }, [activeSessionExercises]);

  const totalCompletedSets = useMemo(() => {
    return Object.values(completedSetsMap).reduce((acc, val) => acc + val, 0);
  }, [completedSetsMap]);

  // Realistic Gym Duration: 3.5 mins per set (lifting, plate loading, rest, logging) + 10 mins warm-up & equipment transitions
  const estimatedDurationMinutes = useMemo(() => {
    if (totalPrescribedSets === 0) return 0;
    return Math.max(30, Math.round(totalPrescribedSets * 3.5 + 10));
  }, [totalPrescribedSets]);

  const startFocusMode = (idx = 0) => {
    const ex = activeSessionExercises[idx];
    if (ex) {
      setFocusIdx(idx);
      setFocusW(ex.latest?.weight || 60);
      setFocusR(ex.targetReps || ex.latest?.reps || 10);
    }
    setFocusMode(true);
    wakeLock.setEnabled(true);
  };

  const exitFocusMode = () => {
    setFocusMode(false);
  };

  const handleFocusSubmitSet = () => {
    if (isSubmittingSetRef.current) return;

    const curEx = activeSessionExercises[focusIdx];
    if (!curEx) return;

    isSubmittingSetRef.current = true;
    setIsSubmittingSet(true);

    const curDone = completedSetsMap[curEx.id] || 0;
    const nextDone = curDone + 1;
    const weightVal = focusW;
    const repsVal = focusR;
    const exId = curEx.id;
    const exName = curEx.name;

    // 1. Optimistically update completed sets map & per-set weight details
    setCompletedSetsMap((prev) => ({
      ...prev,
      [exId]: nextDone,
    }));
    setCompletedSetDetailsMap((prev) => ({
      ...prev,
      [exId]: {
        ...(prev[exId] || {}),
        [curDone]: { weight: weightVal, reps: repsVal },
      },
    }));

    // 2. Optimistically update exercises state
    const todayStr = new Date().toISOString().split("T")[0];
    const optimisticLog: ExerciseLog = {
      weight: weightVal,
      reps: repsVal,
      sets: nextDone,
      date: todayStr,
      sessionNotes: "",
    };
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exId
          ? {
              ...e,
              latest: optimisticLog,
              history: [
                optimisticLog,
                ...e.history.filter((h) => !(h.date === todayStr && h.sets === nextDone)),
              ],
            }
          : e
      )
    );

    // 3. Immediately display and start rest timer with zero delay
    const durationSeconds = 90;
    const startedAt = Date.now();
    const endsAt = startedAt + durationSeconds * 1000;

    startRestTimer({
      durationSeconds,
      startedAt,
      endsAt,
      exerciseName: displayExerciseName(exName),
      status: "running",
    });

    // 5. Save in background without blocking the timer, with safe retries
    const saveCompletedSetInBackground = async (attempt = 1): Promise<void> => {
      try {
        const res = await fetch("/api/workouts/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exerciseId: exId,
            weight: weightVal,
            reps: repsVal,
            sets: nextDone,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const confirmedLog: ExerciseLog = {
            weight: data.data.weight,
            reps: data.data.reps,
            sets: data.data.sets,
            date: data.data.date,
            sessionNotes: data.data.sessionNotes || "",
          };
          setExercises((prev) =>
            prev.map((e) =>
              e.id === exId
                ? {
                    ...e,
                    latest: confirmedLog,
                    history: [confirmedLog, ...e.history.filter((h) => h !== optimisticLog)],
                  }
                : e
            )
          );
        } else if (attempt <= 2) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          return saveCompletedSetInBackground(attempt + 1);
        }
      } catch {
        if (attempt <= 2) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          return saveCompletedSetInBackground(attempt + 1);
        }
      }
    };

    void saveCompletedSetInBackground().finally(() => {
      setTimeout(() => {
        isSubmittingSetRef.current = false;
        setIsSubmittingSet(false);
      }, 500);
    });
  };

  const handleUndoFocusSet = () => {
    const curEx = activeSessionExercises[focusIdx];
    if (!curEx) return;

    const curDone = completedSetsMap[curEx.id] || 0;
    if (curDone > 0) {
      const setIdxToRemove = curDone - 1;
      setCompletedSetsMap((prev) => ({
        ...prev,
        [curEx.id]: curDone - 1,
      }));
      setCompletedSetDetailsMap((prev) => {
        const exMap = { ...(prev[curEx.id] || {}) };
        delete exMap[setIdxToRemove];
        return { ...prev, [curEx.id]: exMap };
      });
      stopRestTimer();
    }
  };
  // The Airtable singleSelect field only has Arabic choice values ("اليوم
  // الاول"..."اليوم السابع") — this is what's actually stored and matched
  // against, regardless of UI language. `selectedDayName` below is *display
  // only*; using it for matching/writes broke everything in English mode
  // (schedules never matched "Day 1", and saving one would send an English
  // string Airtable's singleSelect field doesn't recognize as a valid
  // option).
  const selectedDayKey = DAY_KEYS[selectedDay].ar;
  const selectedDayName = isAr ? DAY_KEYS[selectedDay].ar : DAY_KEYS[selectedDay].en;

  // ── Exercise helpers ──
  // The weight log below is scoped to whatever's planned for the selected
  // day — otherwise the schedule up top doesn't drive anything, and you're
  // stuck scrolling the entire ~33-exercise gym library to log a set. Falls
  // back to the full library when nothing's been scheduled for that day yet
  // (e.g. a day with no plan added), so the page never renders empty.
  // Matches by real exercise record ID (from the جدول التمارين ↔ مكتبة
  // التمارين link) instead of exercise-name text — a previous version
  // matched on name and silently broke whenever the stored text didn't
  // exactly match the library (typos, reformatting, etc).
  const scheduledExerciseIds = new Set(
    todaySchedules.flatMap((s) => s.items.map((it) => it.exerciseId))
  );
  // exerciseId -> its prescribed reps/sets for the selected day, so the
  // exercise cards below can show what the plan calls for (e.g. "15×3")
  // instead of just the logging history — previously this info only
  // appeared in the "جدول التمارين" schedule card above, not next to the
  // exercise itself where you actually log a set.
  const scheduledDetailsByExerciseId = new Map<string, ScheduleItem>(
    todaySchedules.flatMap((s) => s.items.map((it) => [it.exerciseId, it] as const))
  );
  const daySourceExercises =
    scheduledExerciseIds.size > 0
      ? exercises.filter((e) => scheduledExerciseIds.has(e.id))
      : [];

  const muscleGroups = [...new Set(daySourceExercises.map((e) => e.muscleGroup))].sort();
  const filtered =
    filterGroup === "all"
      ? daySourceExercises
      : daySourceExercises.filter((e) => e.muscleGroup === filterGroup);
  const grouped = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    if (!acc[ex.muscleGroup]) acc[ex.muscleGroup] = [];
    acc[ex.muscleGroup].push(ex);
    return acc;
  }, {});

  // ── Schedule exercise picker (full library, not day-filtered) ──
  const selectedSchedIds = Object.keys(schedDetails);
  const pickerExercises = exercises.filter((e) =>
    e.name.toLowerCase().includes(schedPickerQuery.trim().toLowerCase())
  );
  const pickerGrouped = pickerExercises.reduce<Record<string, Exercise[]>>(
    (acc, ex) => {
      if (!acc[ex.muscleGroup]) acc[ex.muscleGroup] = [];
      acc[ex.muscleGroup].push(ex);
      return acc;
    },
    {}
  );

  const openEditForm = (entry: ScheduleEntry) => {
    setEditingId(entry.id);
    const details: Record<string, { reps: string; sets: string }> = {};
    entry.items.forEach((it) => {
      details[it.exerciseId] = {
        reps: it.reps != null ? String(it.reps) : "",
        sets: it.sets != null ? String(it.sets) : "",
      };
    });
    setSchedDetails(details);
    setSchedPickerQuery("");
    setShowAddForm(true);
  };

  // "Add" used to always create a brand new جدول التمارين record, even when
  // the selected day already had one — so clicking it twice for the same
  // day left two separate (and confusingly split) plans behind. Now it
  // reuses the day's existing plan (editing into it) if one exists, and
  // only starts a genuinely new record when the day has none yet.
  const openAddForm = () => {
    const existing = todaySchedules[0];
    if (existing) {
      openEditForm(existing);
      return;
    }
    setEditingId(null);
    setSchedDetails({});
    setSchedPickerQuery("");
    setShowAddForm(true);
  };

  const cancelSchedForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setSchedDetails({});
    setSchedPickerQuery("");
  };

  // Suggests starting reps/sets values (defaults to 3 sets × 10 reps)
  const suggestRepsSets = (exerciseId: string): { reps: string; sets: string } => {
    const latest = exercises.find((e) => e.id === exerciseId)?.latest;
    return {
      reps: latest && latest.reps > 0 ? String(latest.reps) : "10",
      sets: latest && latest.sets > 0 ? String(latest.sets) : "3",
    };
  };

  // Toggle one exercise in/out of selection
  const toggleSchedExercise = (exerciseId: string) => {
    setSchedDetails((prev) => {
      if (exerciseId in prev) {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      }
      return { ...prev, [exerciseId]: suggestRepsSets(exerciseId) };
    });
  };

  const setSchedExerciseDetail = (
    exerciseId: string,
    field: "reps" | "sets",
    value: string
  ) => {
    setSchedDetails((prev) => ({
      ...prev,
      [exerciseId]: { ...prev[exerciseId], [field]: value },
    }));
  };

  const submitSchedule = async () => {
    const ids = Object.keys(schedDetails);
    if (ids.length === 0) return;
    const items = ids.map((exerciseId) => {
      const parsedReps = parseInt(schedDetails[exerciseId]?.reps ?? "", 10);
      const parsedSets = parseInt(schedDetails[exerciseId]?.sets ?? "", 10);
      const reps = Number.isFinite(parsedReps) && parsedReps > 0 ? parsedReps : 10;
      const sets = Number.isFinite(parsedSets) && parsedSets > 0 ? parsedSets : 3;
      return {
        exerciseId,
        reps,
        sets,
      };
    });
    setSchedSaving(true);
    try {
      if (editingId) {
        await fetch(`/api/workouts/schedules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            targetDay: selectedDayKey,
          }),
        });
      } else {
        await fetch("/api/workouts/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planName: "خطة مخصصة",
            targetDay: selectedDayKey,
            items,
          }),
        });
      }
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 2000);
      cancelSchedForm();
      invalidateClientCache("/api/workouts/schedules");
      fetchSchedules(true);
    } catch {
      // silently fail
    } finally {
      setSchedSaving(false);
    }
  };

  // "Vacation" — moves everything scheduled for the currently selected day
  // into the next day's slot.
  const moveToVacation = async () => {
    setVacationSaving(true);
    try {
      const res = await fetch("/api/workouts/schedules/vacation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: selectedDayKey }),
      });
      const data = await res.json();
      if (data.success) {
        setShowVacationConfirm(false);
        setVacationDone(data.movedCount > 0);
        setTimeout(() => setVacationDone(null), 2500);
        invalidateClientCache("/api/workouts/schedules");
        fetchSchedules(true);
      }
    } catch {
      // silently fail — nothing moved, the confirm panel just stays open
    } finally {
      setVacationSaving(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    setDeletingId(id);
    const prev = schedules;
    setSchedules((s) => s.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/workouts/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setSchedules(prev);
      } else {
        invalidateClientCache("/api/workouts/schedules");
      }
    } catch {
      setSchedules(prev);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Scroll to exercise in weight log ──
  const scrollToExercise = (exerciseId: string) => {
    document
      .getElementById(`exercise-${exerciseId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ── Weight log helpers ──
  const openLogForm = (exerciseId: string) => {
    setLogExerciseId(exerciseId);
    const ex = exercises.find((e) => e.id === exerciseId);
    setLogWeight(ex?.latest?.weight?.toString() ?? "");
    setLogReps(ex?.latest?.reps?.toString() ?? "");
    setLogSets(ex?.latest?.sets?.toString() ?? "");
    setLogNotes("");
    setLogError(null);
  };

  const cancelLog = useCallback(() => {
    setLogExerciseId(null);
    setLogWeight("");
    setLogReps("");
    setLogSets("");
    setLogNotes("");
    setLogError(null);
  }, []);

  // Dismiss open weight card or quick log form when clicking anywhere outside
  useEffect(() => {
    if (!expanded && !logExerciseId) return;

    let startX = 0;
    let startY = 0;

    const onPointerDown = (e: PointerEvent) => {
      startX = e.clientX;
      startY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If user was scrolling/dragging (finger moved > 10px), do not dismiss
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      if (diffX > 10 || diffY > 10) return;

      // Inside active expanded card -> keep open
      if (activeCardRef.current && activeCardRef.current.contains(target)) {
        return;
      }

      // Trigger button on an exercise card -> let that button's click handler execute
      if (target.closest?.("[data-exercise-trigger]")) {
        return;
      }

      // Dialog, sheet, or popover portal -> keep open
      if (
        target.closest?.(
          "[role='dialog'], [data-radix-popper-content-wrapper], .radix-portal, [data-portal], .sheet-content"
        )
      ) {
        return;
      }

      // User clicked/tapped outside -> close expanded card and log form
      setExpanded(null);
      cancelLog();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [expanded, logExerciseId, cancelLog]);

  const submitLog = async (exerciseId: string) => {
    const weight = parseFloat(logWeight);
    if (isNaN(weight) || weight <= 0) {
      setLogError(isAr ? "أدخل وزن صحيح أكبر من صفر" : "Enter a valid weight greater than 0");
      return;
    }
    if (weight > MAX_WEIGHT_KG) {
      setLogError(
        isAr
          ? `القيمة غلط — أقصى وزن مسموح ${MAX_WEIGHT_KG} كغ`
          : `That's too high — max allowed is ${MAX_WEIGHT_KG}kg`
      );
      return;
    }
    setLogError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/workouts/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          weight,
          reps: parseInt(logReps) || 0,
          sets: parseInt(logSets) || 0,
          sessionNotes: logNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update this exercise's card in place instead of reloading the
        // whole page (setLoading(true) + refetch used to blank out the
        // entire list and scroll back to the top — the new entry was
        // saved, but you'd land back at the day selector with no clue
        // where it went). Now it appears immediately under the same card,
        // and we auto-expand the history so it's impossible to miss.
        const newLog: ExerciseLog = {
          weight: data.data.weight,
          reps: data.data.reps,
          sets: data.data.sets,
          date: data.data.date,
          sessionNotes: data.data.sessionNotes || "",
        };
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === exerciseId
              ? { ...ex, latest: newLog, history: [newLog, ...ex.history] }
              : ex
          )
        );
        setExpanded(exerciseId);
        setJustSaved(exerciseId);
        setTimeout(() => setJustSaved(null), 2000);
        cancelLog();
        // Auto-launch rest timer between sets
        const savedEx = exercises.find((e) => e.id === exerciseId);
        startRestTimer(60, savedEx ? displayExerciseName(savedEx.name) : undefined);
        // Scroll to the now-expanded history once it's rendered (the log
        // form that was open collapses at the same time, so wait a tick
        // for layout to settle before measuring where to scroll).
        window.setTimeout(() => {
          document
            .getElementById(`exercise-${exerciseId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      } else {
        // This used to fall through silently — the request failed (e.g.
        // the server-side max-weight check rejected the value), but with
        // no `else` here nothing told the member that: the form just sat
        // there looking like it did nothing, which read as "it said it
        // saved but didn't" (reported). Now the server's own validation
        // message surfaces directly in the same red inline error as the
        // client-side check above.
        setLogError(
          data.message || (isAr ? "تعذر حفظ القيمة" : "Couldn't save that value")
        );
      }
    } catch {
      setLogError(isAr ? "تعذر الاتصال — حاول مرة ثانية" : "Connection failed — try again");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(isAr ? "ar-EG" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── HYBRID MODE C: ACTIVE FOCUS SESSION (1c) ──
  // ═════════════════════════════════════════════════════════════════════════
  if (focusMode && activeSessionExercises.length > 0) {
    const curEx = activeSessionExercises[focusIdx] || activeSessionExercises[0];
    const curDoneSets = completedSetsMap[curEx.id] || 0;
    const isExFinished = curDoneSets >= (curEx.targetSets || 3);

    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200 pb-20 max-w-xl mx-auto">
        {/* Ambient Neon Glow Header */}
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/30 p-5 sm:p-6 shadow-2xl shadow-primary/20">
          <div className="absolute -top-24 -left-24 w-60 h-60 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

          {/* Top Focus Bar with Exit, Screen Awake, Progress Pips, and Clock */}
          <div className="relative z-10 flex items-center justify-between gap-2 border-b border-border/50 pb-4">
            <Button
              variant="outline"
              size="icon"
              onClick={exitFocusMode}
              className="w-10 h-10 rounded-2xl bg-card/80 border-border/80 text-foreground/80 hover:text-foreground hover:bg-card-hover cursor-pointer shrink-0"
              title={isAr ? "العودة للجدول الكامل" : "Exit to Routine"}
            >
              <X className="w-5 h-5" />
            </Button>

            {/* Screen Wake Lock inside Focus Mode */}
            {wakeLock.supported && (
              <Button
                variant="outline"
                size="sm"
                onClick={wakeLock.toggle}
                className={cn(
                  "h-9 px-2.5 rounded-xl text-2xs font-bold gap-1.5 border cursor-pointer shrink-0 transition-all",
                  wakeLock.enabled
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-xs shadow-amber-500/20"
                    : "bg-card/80 border-border/80 text-foreground/70 hover:bg-card-hover"
                )}
                title={isAr ? "إبقاء الشاشة مضاءة" : "Screen Awake"}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", wakeLock.enabled ? "bg-amber-400 animate-ping" : "bg-foreground/40")} />
                <span>{isAr ? "شاشة مضاءة" : "Awake"}</span>
              </Button>
            )}

            {/* Progress Pips */}
            <div className="flex items-center gap-1.5 flex-1 max-w-[140px] mx-1">
              {activeSessionExercises.map((e, i) => {
                const isDone = (completedSetsMap[e.id] || 0) >= (e.targetSets || 3);
                const isCurrent = i === focusIdx;
                return (
                  <div
                    key={e.id}
                    className={cn(
                      "h-2 flex-1 rounded-full transition-all",
                      isDone
                        ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                        : isCurrent
                          ? "bg-primary shadow-xs shadow-primary"
                          : "bg-muted"
                    )}
                  />
                );
              })}
            </div>

            <div className="flex items-center shrink-0">
              <span className="font-mono font-bold text-xs text-foreground/80 bg-background/80 px-2.5 py-1.5 rounded-xl border border-border/70">
                ⏱️ {formatElapsed(sessionElapsedSec)}
              </span>
            </div>
          </div>

          {/* Current Exercise Big Banner */}
          <div className="relative z-10 pt-4 text-start space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-primary tracking-wider uppercase">
                {curEx.muscleGroup} · {isAr ? `تمرين ${focusIdx + 1} من ${activeSessionExercises.length}` : `Exercise ${focusIdx + 1} of ${activeSessionExercises.length}`}
              </span>
              <span className="text-2xs font-semibold text-foreground/70 bg-muted/60 px-2.5 py-0.5 rounded-lg border border-border/40">
                {isAr ? "الهدف:" : "Target:"} {curEx.prescribed}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {displayExerciseName(curEx.name)}
            </h2>

            <p className="text-xs text-foreground/60">
              {curEx.latest ? (
                <>
                  {isAr ? "آخر إنجاز مسجل:" : "Last Recorded:"}{" "}
                  <span className="font-bold text-accent">
                    {curEx.latest.weight} كغ × {curEx.latest.reps} تكرار
                  </span>
                </>
              ) : (
                isAr ? "أول جلسة لتسجيل هذا التمرين" : "First time logging this exercise"
              )}
            </p>
          </div>
        </div>

        {/* Stepper Card */}
        <Card className="rounded-3xl bg-card border-2 border-border/80 p-5 sm:p-6 shadow-lg">
          <div className="space-y-6">
            {/* Set Subtitle & Undo Button */}
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                <h3 className="font-bold text-sm text-foreground">
                  {isAr ? `المجموعة ${Math.min(curDoneSets + 1, curEx.targetSets || 3)} من ${curEx.targetSets || 3}` : `Set ${Math.min(curDoneSets + 1, curEx.targetSets || 3)} of ${curEx.targetSets || 3}`}
                </h3>
              </div>
              
              <div className="flex items-center gap-2">
                {curDoneSets > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndoFocusSet}
                    className="h-7 px-2 text-2xs font-bold text-foreground/60 hover:text-foreground gap-1 cursor-pointer"
                    title={isAr ? "تراجع عن آخر مجموعة مسجلة" : "Undo last set"}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isAr ? "تراجع عن مجموعة" : "Undo"}</span>
                  </Button>
                )}
                {isExFinished && (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    {isAr ? "أنهيت المجموعات ✓" : "Completed ✓"}
                  </span>
                )}
              </div>
            </div>

            {/* Stepper Inputs Row (Editable typing + 0.5kg stepping) */}
            <div className="grid grid-cols-2 gap-4">
              {/* Weight Stepper (0.5kg precision & typing) */}
              <div className="rounded-2xl bg-card-hover border border-border/60 p-4 text-center space-y-3">
                <span className="text-xs font-bold text-foreground/70">{isAr ? "الوزن (كغ)" : "Weight (kg)"}</span>
                <div className="flex items-center justify-center">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={MAX_WEIGHT_KG}
                    value={focusW}
                    onChange={(e) => setFocusW(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-28 text-center text-3xl sm:text-4xl font-black text-foreground tabular-nums bg-transparent border-b-2 border-border/60 focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFocusW((w) => Math.max(0, round1(w - 0.5)))}
                    className="flex-1 h-9 rounded-xl font-bold text-xs bg-background/80 hover:bg-card border-border/80 cursor-pointer"
                  >
                    -0.5
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFocusW((w) => round1(w + 0.5))}
                    className="flex-1 h-9 rounded-xl font-bold text-xs bg-background/80 hover:bg-card border-border/80 cursor-pointer"
                  >
                    +0.5
                  </Button>
                </div>
              </div>

              {/* Reps Stepper (Direct typing + stepper) */}
              <div className="rounded-2xl bg-card-hover border border-border/60 p-4 text-center space-y-3">
                <span className="text-xs font-bold text-foreground/70">{isAr ? "التكرارات" : "Reps"}</span>
                <div className="flex items-center justify-center">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={focusR}
                    onChange={(e) => setFocusR(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 text-center text-3xl sm:text-4xl font-black text-foreground tabular-nums bg-transparent border-b-2 border-border/60 focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFocusR((r) => Math.max(1, r - 1))}
                    className="flex-1 h-9 rounded-xl font-bold text-xs bg-background/80 hover:bg-card border-border/80 cursor-pointer"
                  >
                    -1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFocusR((r) => r + 1)}
                    className="flex-1 h-9 rounded-xl font-bold text-xs bg-background/80 hover:bg-card border-border/80 cursor-pointer"
                  >
                    +1
                  </Button>
                </div>
              </div>
            </div>

            {/* Primary Action Button (Switches to 'Finish Rest' during rest period) */}
            {restTimerOpen && restTimerActive ? (
              <Button
                onClick={stopRestTimer}
                className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white shadow-xl shadow-blue-500/30 hover:brightness-110 gap-2 cursor-pointer animate-pulse"
              >
                <Timer className="w-5 h-5 animate-spin" />
                <span>{isAr ? "إنهاء الراحة والبدء بالجولة التالية" : "Finish Rest & Start Next Set"}</span>
              </Button>
            ) : (
              <Button
                onClick={handleFocusSubmitSet}
                disabled={isSubmittingSet}
                className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-r from-primary via-blue-600 to-sky-500 text-white shadow-xl shadow-primary/30 hover:brightness-110 gap-2 cursor-pointer transition-all disabled:opacity-75"
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>{isAr ? "سجّل المجموعة — ابدأ الراحة" : "Log Set — Start Rest"}</span>
              </Button>
            )}

            {/* Navigation Controls */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={focusIdx === 0}
                onClick={() => startFocusMode(focusIdx - 1)}
                className="flex-1 h-10 rounded-xl text-xs font-bold text-foreground/70 hover:text-foreground gap-1 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>{isAr ? "التمرين السابق" : "Prev Exercise"}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={focusIdx >= activeSessionExercises.length - 1}
                onClick={() => startFocusMode(focusIdx + 1)}
                className="flex-1 h-10 rounded-xl text-xs font-bold text-foreground/70 hover:text-foreground gap-1 disabled:opacity-30 cursor-pointer"
              >
                <span>{isAr ? "التمرين التالي" : "Next Exercise"}</span>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Set Tracker Carousel with Edge Fade & Horizontal Scroll (Click any completed set to undo/re-edit) */}
        <div className="relative w-full overflow-hidden py-1">
          {/* Left Edge Fade */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background via-background/80 to-transparent z-10 pointer-events-none" />
          {/* Right Edge Fade */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background via-background/80 to-transparent z-10 pointer-events-none" />

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-6 py-1 snap-x snap-mandatory">
            {Array.from({ length: curEx.targetSets || 3 }).map((_, sIdx) => {
              const isDone = sIdx < curDoneSets;
              const isNext = sIdx === curDoneSets;
              const setDetail = completedSetDetailsMap[curEx.id]?.[sIdx];
              const displayWeight = setDetail ? setDetail.weight : focusW;
              return (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => {
                    if (isDone) {
                      handleUndoFocusSet();
                    }
                  }}
                  title={isDone ? (isAr ? "انقر للتراجع عن المجموعة" : "Click to undo set") : undefined}
                  className={cn(
                    "shrink-0 w-[82px] sm:w-[90px] h-11 rounded-xl border flex items-center justify-center font-mono text-xs font-bold transition-all cursor-pointer snap-center",
                    isDone
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-xs shadow-emerald-500/30 hover:bg-destructive/20 hover:border-destructive/40 hover:text-destructive"
                      : isNext
                        ? "bg-primary/15 border-primary/50 text-primary ring-2 ring-primary/20 animate-pulse"
                        : "bg-card-hover border-border/60 text-foreground/40"
                  )}
                >
                  {isDone ? `✓ ${displayWeight}k` : isAr ? `مجموعة ${sIdx + 1}` : `Set ${sIdx + 1}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ── HYBRID MODE A: CLEAN ROUTINE OVERVIEW (1a) ──
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Desktop Clean Hero Banner (>= lg) */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/25">
              <Dumbbell className="w-3.5 h-3.5" />
              {currentSplitName}
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("workouts.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "جدول تمارينك اليومية مع تسجيل الأوزان والتكرارات ومتابعة إنجازك بالرسوم البيانية."
                : "Track daily workout splits, log sets & reps, and observe strength progress curves."}
            </p>
          </div>

          {managedByTrainer && (
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary border border-primary/20 text-xs font-bold text-primary-foreground shrink-0">
              <UserCog className="w-4 h-4" />
              {isAr ? "الخطة تحت إشراف المدرب" : "Managed by Coach"}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Clean Header (< lg) */}
      <div className="block lg:hidden space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          {t("workouts.title")}
        </h1>
        <p className="text-xs text-foreground/70">
          {currentSplitName}
        </p>
      </div>

      {/* Day Selector Strip */}
      <div className="space-y-1.5 max-w-md">
        <div className="grid grid-cols-7 gap-1 text-center">
          {DAY_KEYS.map((day, idx) => {
            const weekday = (anchorDay + idx) % 7;
            return (
              <div
                key={idx}
                className="text-3xs font-semibold text-foreground truncate px-0.5"
              >
                {weekdayNames[weekday]}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_KEYS.map((day, idx) => {
            const isSelected = selectedDay === idx;
            const isToday = idx === todayIdx;
            const hasRecordedLogs = daysWithLogs.has(idx);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedDay(idx)}
                className={cn(
                  "relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold tabular-nums transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "bg-muted/40 text-foreground hover:bg-muted/60",
                  isToday && !isSelected && "ring-2 ring-primary"
                )}
              >
                <span>{idx + 1}</span>
                {hasRecordedLogs && (
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full mt-0.5",
                      isSelected ? "bg-white" : "bg-emerald-400 shadow-xs shadow-emerald-400/80"
                    )}
                    title={isAr ? "يوجد أوزان مسجلة" : "Has logged weights"}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── If Rest Day (No Scheduled Exercises) ── */}
      {activeSessionExercises.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border/80 p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
            <Palmtree className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">
              {isAr ? "🏖️ يوم راحة واستشفاء عضلات" : "🏖️ Rest & Muscle Recovery Day"}
            </h3>
            <p className="text-xs text-foreground/60 max-w-sm mx-auto leading-relaxed">
              {isAr
                ? "لا توجد تمارين مجدولة لهذا اليوم. خذ قسطاً من الراحة لتستعيد عضلاتك قوتها، أو يمكنك إضافة تمارين مخصصة إذا رغبت بالتمرين."
                : "No routine scheduled for today. Enjoy your rest day or add custom exercises."}
            </p>
          </div>
          {!managedByTrainer && (
            <Button
              onClick={openAddForm}
              className="rounded-2xl text-xs font-bold bg-primary text-primary-foreground gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? "إضافة تمارين لليوم" : "Add Exercises for Today"}</span>
            </Button>
          )}
        </div>
      ) : (
        /* ── If Workout Scheduled: 1a Session Summary Card (Overview) ── */
        <div className="rounded-3xl bg-card border border-border/80 p-5 sm:p-6 shadow-sm space-y-4">
          {isSelectedToday ? (
            <>
              <div className="flex items-baseline justify-between">
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 text-2xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isAr ? "تمرين اليوم النشط" : "Today's Active Workout"}</span>
                  </div>
                  <h3 className="font-bold text-base text-foreground">
                    {activeSessionExercises.length} {isAr ? "تمارين مجدولة" : "Exercises"} · {totalPrescribedSets} {isAr ? "مجموعات" : "Sets"}
                  </h3>
                  <p className="text-xs text-foreground/60">
                    {isAr ? "المدة المتوقعة:" : "Estimated:"} ≈ {estimatedDurationMinutes} {isAr ? "دقيقة" : "min"}
                  </p>
                </div>
                <div className="text-end">
                  <span className="text-xs font-bold text-primary font-mono">
                    {totalCompletedSets} / {totalPrescribedSets} {isAr ? "مجموعات منجزة" : "completed"}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
                  style={{
                    width: `${totalPrescribedSets > 0 ? Math.min(100, (totalCompletedSets / totalPrescribedSets) * 100) : 0}%`,
                  }}
                />
              </div>

              {/* Primary CTA Button: Launch 1c Focus Mode */}
              <Button
                onClick={() => startFocusMode(0)}
                className="w-full h-14 rounded-2xl font-black text-base bg-gradient-to-r from-primary via-blue-600 to-sky-500 text-white shadow-xl shadow-primary/30 hover:brightness-110 gap-2 cursor-pointer"
              >
                <Flame className="w-5 h-5" />
                <span>{isAr ? "ابدأ التمرين الآن (وضع التركيز)" : "Start Workout (Focus Mode)"}</span>
              </Button>

              {/* Vacation Button (Available for all trainees) */}
              <div className="pt-1">
                {!showVacationConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowVacationConfirm(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-foreground/60 hover:text-foreground transition-all cursor-pointer"
                  >
                    <Palmtree className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isAr ? "خذ راحة اليوم (ترحيل التمرين للغد)" : "Take rest day (Postpone to tomorrow)"}</span>
                  </button>
                ) : (
                  <div className="bg-background/80 border border-border rounded-2xl p-4 space-y-3 animate-fade-in">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">
                        {isAr
                          ? "هل ترغب بأخذ يوم راحة اليوم ونقل جدول التمارين إلى الغد؟"
                          : "Would you like to take today off and move this workout to tomorrow?"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={moveToVacation}
                        disabled={vacationSaving}
                        className="flex-1 rounded-xl text-xs font-bold bg-primary text-primary-foreground cursor-pointer"
                      >
                        {vacationSaving ? (isAr ? "جاري الترحيل..." : "Moving...") : (isAr ? "نعم، ترحيل للغد" : "Yes, Postpone")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowVacationConfirm(false)}
                        className="rounded-xl text-xs font-bold cursor-pointer"
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Preview / Past Day Mode: Strictly View-Only ── */
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-2xs font-bold text-foreground/80 bg-muted/70 border border-border/80 px-2.5 py-1 rounded-full">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <span>{isAr ? `معاينة جدول: ${selectedDayName}` : `Preview: ${selectedDayName}`}</span>
                  </div>
                  <h3 className="font-bold text-base text-foreground pt-1">
                    {activeSessionExercises.length} {isAr ? "تمارين" : "Exercises"} · {totalPrescribedSets} {isAr ? "مجموعات" : "Sets"}
                  </h3>
                  <p className="text-xs text-foreground/70">
                    {(() => {
                      const loggedCount = activeSessionExercises.filter((e) => e.latest != null).length;
                      return isAr
                        ? `${loggedCount} من ${activeSessionExercises.length} تمارين مسجلة الأوزان (للاطلاع فقط)`
                        : `${loggedCount} of ${activeSessionExercises.length} exercises logged (View Only)`;
                    })()}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedDay(todayIdx)}
                  className="rounded-xl text-xs font-bold text-primary border-primary/30 hover:bg-primary/10 gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>{isAr ? `تمرين اليوم (${DAY_KEYS[todayIdx].ar})` : "Go to Today"}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section Header: Routine List (Only shown if exercises exist) */}
      {activeSessionExercises.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-lg font-black text-foreground">
            {isAr ? "تمارين الخطة" : "Today's Exercises"}
          </h2>
          {!managedByTrainer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => (showAddForm ? cancelSchedForm() : openAddForm())}
              className="text-xs font-bold rounded-xl border-border/80 bg-card hover:bg-card-hover text-foreground/80 hover:text-foreground gap-1.5 cursor-pointer shadow-xs"
            >
              {todaySchedules.length > 0 ? (
                <>
                  <Pencil className="w-3.5 h-3.5 text-primary" />
                  <span>{isAr ? "تعديل تمارين الجدول" : "Edit Split"}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>{isAr ? "إضافة تمرين للجدول" : "Add to Split"}</span>
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Add/Edit Schedule Routine Form (if toggled) */}
      {showAddForm && (
        <Card className="border border-border bg-card rounded-3xl p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">
                {editingId
                  ? isAr
                    ? "✏️ تعديل جدول التمارين المخصص"
                    : "✏️ Edit Day Workout Routine"
                  : isAr
                    ? "➕ إضافة تمارين لجدول اليوم"
                    : "➕ Add Exercises to Today's Split"}
              </h3>
              <p className="text-3xs text-foreground/60">
                {isAr
                  ? "حدد التمارين المطلوبة والجولات والتكرارات المستهدفة"
                  : "Pick exercises and set prescribed sets × reps"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={cancelSchedForm}
              className="w-7 h-7 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Search + pick from the real exercise library */}
          <div className="relative">
            <Search className="w-4 h-4 text-foreground/70 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={schedPickerQuery}
              onChange={(e) => setSchedPickerQuery(e.target.value)}
              placeholder={isAr ? "ابحث عن تمرين لإضافته..." : "Search exercises..."}
              className="w-full bg-background border border-border rounded-xl ps-9 pe-4 py-2 text-xs text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="max-h-48 overflow-y-auto bg-background border border-border rounded-xl divide-y divide-border/60">
            {pickerExercises.length === 0 ? (
              <p className="text-xs text-foreground/70 text-center py-4">
                {isAr ? "لا توجد نتائج" : "No matches"}
              </p>
            ) : (
              Object.entries(pickerGrouped).map(([group, list]) => (
                <div key={group} className="p-2 space-y-1">
                  <p className="text-3xs font-bold text-primary uppercase px-2">
                    {group}
                  </p>
                  {list.map((ex) => {
                    const isChecked = selectedSchedIds.includes(ex.id);
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => toggleSchedExercise(ex.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-start cursor-pointer",
                          isChecked ? "bg-primary text-primary-foreground" : "hover:bg-card text-foreground"
                        )}
                      >
                        <span>{displayExerciseName(ex.name)}</span>
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Selected exercises with Sets × Reps inputs */}
          {selectedSchedIds.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2 px-3 py-1">
                <span className="text-xs font-bold text-foreground/90 flex-1 min-w-0">
                  {isAr ? "التمارين المحددة للجدول:" : "Selected Exercises:"}
                </span>
                <span className="w-14 text-center text-3xs font-bold text-primary">
                  {isAr ? "الجولات" : "Sets"}
                </span>
                <span className="text-xs select-none text-transparent">×</span>
                <span className="w-14 text-center text-3xs font-bold text-primary">
                  {isAr ? "التكرارات" : "Reps"}
                </span>
                <span className="w-[22px] shrink-0" />
              </div>
              <div className="space-y-2">
                {selectedSchedIds.map((exerciseId) => {
                  const ex = exercises.find((e) => e.id === exerciseId);
                  return (
                    <div
                      key={exerciseId}
                      className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2"
                    >
                      <span className="text-xs font-bold text-foreground flex-1 min-w-0 truncate">
                        {ex ? displayExerciseName(ex.name) : exerciseId}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={schedDetails[exerciseId]?.sets ?? ""}
                        onChange={(e) => setSchedExerciseDetail(exerciseId, "sets", e.target.value)}
                        placeholder="3"
                        className="w-14 bg-card border border-border rounded-lg px-2 py-1 text-xs text-center font-bold"
                      />
                      <span className="text-foreground/70 text-xs">×</span>
                      <input
                        type="number"
                        min={1}
                        value={schedDetails[exerciseId]?.reps ?? ""}
                        onChange={(e) => setSchedExerciseDetail(exerciseId, "reps", e.target.value)}
                        placeholder="10"
                        className="w-14 bg-card border border-border rounded-lg px-2 py-1 text-xs text-center font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSchedExercise(exerciseId)}
                        className="text-foreground/70 hover:text-destructive p-1 cursor-pointer"
                        title={isAr ? "إزالة من الجدول" : "Remove"}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={submitSchedule}
              disabled={schedSaving || selectedSchedIds.length === 0}
              className="flex-1 rounded-xl text-xs font-bold bg-primary text-primary-foreground cursor-pointer"
            >
              {schedSaving
                ? (isAr ? "جاري الحفظ..." : "Saving...")
                : editingId
                  ? (isAr ? "حفظ تعديلات الجدول" : "Save Changes")
                  : (isAr ? "حفظ التمارين في الجدول" : "Save Schedule")}
            </Button>
            <Button
              variant="outline"
              onClick={cancelSchedForm}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </Card>
      )}

      {/* Success Toast */}
      {justSaved && (
        <div className="bg-success/10 border border-success/20 rounded-2xl p-4 flex items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
            <Check className="w-5 h-5 text-success" />
          </div>
          <p className="font-bold text-success text-sm">
            {isAr ? "تم حفظ التمرين بنجاح!" : "Exercise logged successfully!"}
          </p>
          <button
            onClick={() => setJustSaved(null)}
            className="ms-auto text-foreground/70 hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Muscle Group Quick Filter & Exercise Groups (Only shown when exercises exist) */}
      {daySourceExercises.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterGroup("all")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                filterGroup === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card text-foreground/70 hover:text-foreground border border-border/60"
              )}
            >
              {isAr ? "الكل" : "All"}
            </button>
            {muscleGroups.map((group) => (
              <button
                key={group}
                onClick={() => setFilterGroup(group)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer",
                  filterGroup === group
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-foreground/70 hover:text-foreground border border-border/60"
                )}
              >
                {group}
              </button>
            ))}
          </div>

          <div id="weight-log" className="scroll-mt-24" />
        </>
      )}

      {/* Exercise Groups & Cards */}
      {Object.entries(grouped).map(([group, groupExercises]) => (
        <div key={group} className="space-y-3">
          <h2 className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-primary" />
            {group}
          </h2>

          {groupExercises.map((exercise) => {
            const isExpanded = expanded === exercise.id;
            const isLogging = logExerciseId === exercise.id;
            const curDoneCount = completedSetsMap[exercise.id] || 0;

            return (
              <div
                key={exercise.id}
                id={`exercise-${exercise.id}`}
                ref={isExpanded || isLogging ? activeCardRef : undefined}
                className="scroll-mt-20"
              >
                <Card className="overflow-hidden border border-border/80 bg-card rounded-2xl shadow-xs transition-all hover:border-primary/30">
                  <CardContent className="p-4 sm:p-5">
                    {/* Exercise Row */}
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-primary/15 border border-primary/30 rounded-2xl flex items-center justify-center shrink-0 text-primary">
                        <Dumbbell className="w-5 h-5" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="font-bold text-foreground text-sm truncate">
                            {displayExerciseName(exercise.name)}
                          </h3>
                          {(() => {
                            const prescribed = scheduledDetailsByExerciseId.get(exercise.id);
                            if (!prescribed) return null;
                            if (prescribed.reps == null && prescribed.sets == null && !prescribed.repsSets)
                              return null;
                            const label =
                              prescribed.reps != null && prescribed.sets != null
                                ? `${prescribed.sets} × ${prescribed.reps}`
                                : prescribed.reps != null
                                  ? prescribed.reps
                                  : prescribed.repsSets;
                            return (
                              <span className="text-2xs font-bold bg-primary/10 text-primary border border-primary/20 rounded-md px-1.5 py-0.5 shrink-0">
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        {exercise.latest ? (
                          <p className="text-xs text-foreground/70 mt-0.5">
                            {isAr ? "آخر وزن:" : "Last:"}{" "}
                            <span className="text-accent font-bold">
                              {exercise.latest.weight} كغ
                            </span>{" "}
                            {exercise.latest.reps > 0 && `× ${exercise.latest.reps} `}
                            {exercise.latest.sets > 0 && `| ${exercise.latest.sets} ${isAr ? "جولات" : "sets"}`}
                            {" · "}
                            {formatDate(exercise.latest.date)}
                          </p>
                        ) : (
                          <p className="text-xs text-foreground/50 mt-0.5">
                            {isAr ? "لم تُسجّل بعد" : "No logs yet"}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons: Start Focus / Inline Log / History */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSelectedToday && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                const fIdx = activeSessionExercises.findIndex((e) => e.id === exercise.id);
                                startFocusMode(fIdx >= 0 ? fIdx : 0);
                              }}
                              className="h-8 px-3 rounded-xl font-black text-xs bg-primary text-primary-foreground hover:brightness-110 gap-1 cursor-pointer shadow-xs shadow-primary/30"
                            >
                              <Flame className="w-3.5 h-3.5" />
                              <span>{isAr ? "ابدأ" : "Start"}</span>
                            </Button>

                            <button
                              data-exercise-trigger="true"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isLogging) {
                                  cancelLog();
                                } else {
                                  openLogForm(exercise.id);
                                }
                              }}
                              className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer",
                                isLogging
                                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                                  : "bg-card-hover border border-border/80 text-foreground/80 hover:text-foreground"
                              )}
                              title={isAr ? "تسجيل يدوي سريع" : "Quick log"}
                            >
                              {isLogging ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </button>
                          </>
                        )}

                        {exercise.history.length > 0 && (
                          <button
                            data-exercise-trigger="true"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded(isExpanded ? null : exercise.id);
                            }}
                            className="w-8 h-8 bg-card-hover border border-border/80 rounded-xl flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
                            title={isAr ? "استعراض التاريخ والرسم البياني" : "History"}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                {/* Inline Log Form */}
                {isLogging && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3 animate-fade-in">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-3xs text-foreground/70 font-semibold uppercase">
                          {isAr ? "الوزن (كغ)" : "Weight (kg)"}
                        </label>
                        <input
                          type="number"
                          value={logWeight}
                          onChange={(e) => {
                            setLogWeight(e.target.value);
                            if (logError) setLogError(null);
                          }}
                          placeholder="0"
                          aria-invalid={!!logError}
                          className={cn(
                            "w-full bg-background border rounded-xl px-3 py-2 text-sm text-foreground font-bold focus:outline-none focus:ring-2 mt-1",
                            logError
                              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                              : "border-border focus:border-primary/60 focus:ring-primary/20"
                          )}
                        />
                      </div>
                      <div>
                        <label className="text-3xs text-foreground/70 font-semibold uppercase">
                          {isAr ? "التكرارات" : "Reps"}
                        </label>
                        <input
                          type="number"
                          value={logReps}
                          onChange={(e) => setLogReps(e.target.value)}
                          placeholder="0"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground font-bold focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-3xs text-foreground/70 font-semibold uppercase">
                          {isAr ? "الجولات" : "Sets"}
                        </label>
                        <input
                          type="number"
                          value={logSets}
                          onChange={(e) => setLogSets(e.target.value)}
                          placeholder="0"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground font-bold focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 mt-1"
                        />
                      </div>
                    </div>
                    {logError && (
                      <p className="text-xs text-destructive font-semibold -mt-1">
                        {logError}
                      </p>
                    )}
                    <input
                      type="text"
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      placeholder={
                        isAr ? "ملاحظات الجلسة (اختياري)" : "Session notes (optional)"
                      }
                      className="w-full bg-background border border-border rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={() => submitLog(exercise.id)}
                      disabled={saving || !logWeight}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                        saving || !logWeight
                          ? "bg-primary/50 text-accent-foreground/50 cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:brightness-110"
                      )}
                    >
                      {saving
                        ? isAr ? "جاري الحفظ..." : "Saving..."
                        : isAr ? "حفظ التمرين" : "Save Exercise"}
                    </button>
                  </div>
                )}

                {/* Expanded History */}
                {isExpanded && exercise.history.length > 0 && (() => {
                  const daySessions = groupHistoryByDay(exercise.history);
                  let chartData: { label: string; weight: number; setsCount?: number; reps?: number }[] = [];
                  let chartTitle = isAr ? "التقدم عبر الوقت" : "Progress Over Time";

                  if (daySessions.length > 1) {
                    chartData = [...daySessions]
                      .reverse()
                      .map((s) => ({
                        label: formatDate(s.date),
                        weight: s.maxWeight,
                        setsCount: s.totalSets,
                      }));
                  } else if (daySessions.length === 1 && daySessions[0].sets.length > 1) {
                    chartTitle = isAr ? "تقدم جولات اليوم" : "Today's Sets Progress";
                    chartData = daySessions[0].sets.map((s, sIdx) => ({
                      label: isAr ? `الجولة ${s.sets || sIdx + 1}` : `Set ${s.sets || sIdx + 1}`,
                      weight: s.weight,
                      reps: s.reps,
                    }));
                  }

                  return (
                    <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
                    {chartData.length > 1 && (
                      <div className="rounded-2xl bg-card-hover/60 border border-border/70 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-foreground/90 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-primary" />
                            <span>{chartTitle}</span>
                          </p>
                          <span className="text-2xs font-bold text-foreground/70 bg-background/80 px-2 py-0.5 rounded-md border border-border/50">
                            {chartData.length} {isAr ? "نقاط" : "points"}
                          </span>
                        </div>
                        <div className="h-44 w-full" dir="ltr">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                              <CartesianGrid stroke={workoutChartTheme.grid} strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: workoutChartTheme.axisText, fontWeight: 500 }}
                                axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
                                tickLine={false}
                                dy={4}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: workoutChartTheme.axisValue, fontWeight: 600 }}
                                axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
                                tickLine={false}
                                domain={["auto", "auto"]}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: workoutChartTheme.tooltipBackground,
                                  border: `1px solid ${workoutChartTheme.tooltipBorder}`,
                                  borderRadius: 12,
                                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
                                  fontSize: 12,
                                  padding: "8px 12px",
                                }}
                                labelStyle={{ color: workoutChartTheme.tooltipSecondaryText, fontWeight: 600, marginBottom: 4 }}
                                itemStyle={{ color: workoutChartTheme.line, fontWeight: "bold" }}
                                formatter={(value: any, _name: any, item: any) => {
                                  const payload = item?.payload;
                                  const extra = payload?.setsCount
                                    ? ` (${payload.setsCount} ${isAr ? "جولات" : "sets"})`
                                    : payload?.reps
                                      ? ` × ${payload.reps}`
                                      : "";
                                  return [`${value} kg${extra}`, isAr ? "الوزن" : "Weight"];
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="weight"
                                stroke={workoutChartTheme.line}
                                strokeWidth={2.5}
                                dot={{
                                  fill: workoutChartTheme.pointFill,
                                  stroke: workoutChartTheme.pointBorder,
                                  strokeWidth: 1.5,
                                  r: 3.5,
                                }}
                                activeDot={{
                                  fill: workoutChartTheme.activePoint,
                                  stroke: "#FFFFFF",
                                  strokeWidth: 2,
                                  r: 5.5,
                                }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-foreground/90 font-bold uppercase tracking-wider">
                          {isAr ? "سجل التمارين" : "Exercise History"}
                        </p>
                        <span className="text-2xs font-semibold text-foreground/60">
                          {daySessions.length} {isAr ? (daySessions.length === 1 ? "يوم مسجل" : "أيام مسجلة") : "days logged"}
                          {" · "}
                          {exercise.history.length} {isAr ? "جولة" : "sets"}
                        </span>
                      </div>
                      {(() => {
                        const showAll = historyShowAll.has(exercise.id);
                        const visibleSessions = showAll
                          ? daySessions
                          : daySessions.slice(0, 5);
                        return (
                          <div className="space-y-2">
                            {visibleSessions.map((session, i) => {
                              const prev = daySessions[i + 1];
                              const delta = prev ? round1(session.maxWeight - prev.maxWeight) : null;
                              const sessionKey = `${exercise.id}-${session.date}`;
                              const isDayExpanded = expandedDaySessions.has(sessionKey);

                              return (
                                <div
                                  key={session.date}
                                  className={cn(
                                    "rounded-2xl border transition-all overflow-hidden",
                                    isDayExpanded
                                      ? "bg-card border-primary/40 shadow-xs"
                                      : "bg-card-hover/90 hover:bg-card-hover border-border/70 hover:border-primary/30"
                                  )}
                                >
                                  {/* Day Header - Clickable to toggle details of that day's sets */}
                                  <button
                                    type="button"
                                    onClick={() => toggleDaySession(sessionKey)}
                                    className="w-full flex items-center justify-between py-2.5 px-3 sm:px-3.5 text-start cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-wrap">
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <Calendar className="w-3.5 h-3.5 text-primary" />
                                        <span className="text-xs font-bold text-foreground">
                                          {formatDate(session.date)}
                                        </span>
                                      </div>

                                      <span className="text-foreground font-black text-sm tabular-nums">
                                        {session.maxWeight}
                                        <span className="text-2xs font-semibold text-foreground/60 ms-0.5">kg</span>
                                      </span>

                                      {delta != null && delta !== 0 && (
                                        <span
                                          className={cn(
                                            "text-2xs font-bold px-1.5 py-0.5 rounded-md border tabular-nums",
                                            delta > 0
                                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                                              : "bg-rose-500/15 text-rose-400 border-rose-500/25"
                                          )}
                                          dir="ltr"
                                        >
                                          {delta > 0 ? "+" : ""}
                                          {delta}kg
                                        </span>
                                      )}

                                      <span className="text-2xs font-semibold text-foreground/75 bg-background/80 px-2 py-0.5 rounded-md border border-border/50 tabular-nums shrink-0">
                                        {session.totalSets} {isAr ? (session.totalSets === 1 ? "جولة" : session.totalSets === 2 ? "جولتان" : "جولات") : "sets"}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 text-foreground/60 shrink-0 ms-2">
                                      <span className="text-3xs font-semibold text-foreground/60 hidden sm:inline">
                                        {isDayExpanded ? (isAr ? "إغلاق" : "Close") : (isAr ? "تفاصيل الجولات" : "Details")}
                                      </span>
                                      <div
                                        className={cn(
                                          "w-6 h-6 rounded-lg flex items-center justify-center transition-transform",
                                          isDayExpanded ? "text-primary rotate-180" : "text-foreground/60"
                                        )}
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </div>
                                    </div>
                                  </button>

                                  {/* Expanded Set Details */}
                                  {isDayExpanded && (
                                    <div className="border-t border-border/60 bg-background/60 p-2.5 space-y-1.5 animate-fade-in">
                                      <div className="text-3xs font-bold text-foreground/60 px-1 mb-1 flex items-center justify-between">
                                        <span>{isAr ? "تفاصيل جولات هذا اليوم:" : "Sets on this day:"}</span>
                                        <span>{session.sets.length} {isAr ? "جولات" : "sets"}</span>
                                      </div>
                                      {session.sets.map((setLog, sIdx) => {
                                        const userNote = extractUserNote(setLog.sessionNotes);
                                        const setNum = setLog.sets || sIdx + 1;
                                        return (
                                          <div
                                            key={sIdx}
                                            className="flex items-center justify-between py-2 px-2.5 bg-card/90 border border-border/60 rounded-xl text-xs"
                                          >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                              <span className="text-2xs font-bold bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-0.5 shrink-0">
                                                {isAr ? `الجولة ${setNum}` : `Set ${setNum}`}
                                              </span>

                                              <span className="font-black text-foreground tabular-nums text-xs">
                                                {setLog.weight} <span className="text-3xs font-medium text-foreground/60">kg</span>
                                              </span>

                                              {setLog.reps > 0 && (
                                                <span className="text-xs font-semibold text-foreground/80 tabular-nums">
                                                  × {setLog.reps} {isAr ? "تكرار" : "reps"}
                                                </span>
                                              )}
                                            </div>

                                            {userNote && (
                                              <span
                                                className="text-3xs text-foreground/75 truncate max-w-[140px] italic bg-background/80 px-2 py-0.5 rounded-md border border-border/50 shrink-0 ms-2"
                                                title={userNote}
                                              >
                                                {userNote}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {daySessions.length > 5 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setHistoryShowAll((prev) => {
                                    const next = new Set(prev);
                                    if (showAll) next.delete(exercise.id);
                                    else next.add(exercise.id);
                                    return next;
                                  })
                                }
                                className="w-full h-9 rounded-xl font-bold text-xs bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 hover:border-primary/50 transition-all cursor-pointer mt-2"
                              >
                                {showAll
                                  ? isAr
                                    ? "عرض أقل"
                                    : "Show less"
                                  : isAr
                                    ? `عرض كل الأيام (${daySessions.length})`
                                    : `Show all days (${daySessions.length})`}
                              </Button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
                </CardContent>
              </Card>
              </div>
            );
          })}
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-20">
          <Dumbbell className="w-12 h-12 text-foreground/70 mx-auto mb-4" />
          <p className="text-foreground/70 font-semibold">
            {exercises.length === 0
              ? isAr
                ? "لا توجد تمارين متاحة"
                : "No exercises available"
              : isAr
                ? "لا يوجد تمارين مطابقة بمكتبة التمارين لهذا اليوم"
                : "None of today's scheduled exercises matched the library"}
          </p>
        </div>
      )}
    </div>
  );
}
