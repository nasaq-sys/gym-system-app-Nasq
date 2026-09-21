"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Dumbbell,
  ClipboardList,
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
  Search,
  UserCheck,
  LayoutTemplate,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Apple,
  Flame,
  Sparkles,
  Calendar,
  Layers,
  Utensils,
  Coffee,
  SunMedium,
  Moon,
  Clock,
  Zap,
  Undo2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import Portal from "@/components/shared/Portal";
import TraineeMealLogsCalendar from "@/components/shared/TraineeMealLogsCalendar";

// ─── Interfaces ───

interface ScheduleItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  repsSets: string;
  sets?: number | null;
  reps?: number | null;
}

interface ExerciseSetsReps {
  sets: string;
  reps: string;
}

function parseRepsSets(raw?: string | null): ExerciseSetsReps {
  if (!raw) return { sets: "3", reps: "10" };
  const match = raw.match(/(\d+)\s*[×x*]\s*(\d+)/i);
  if (match) {
    return { sets: match[1], reps: match[2] };
  }
  const single = raw.match(/\d+/);
  return { sets: "3", reps: single ? single[0] : "10" };
}

interface ScheduleEntry {
  id: string;
  planName: string;
  targetDay: string;
  items: ScheduleItem[];
}

interface ExerciseOption {
  id: string;
  name: string;
  muscleGroup: string;
}

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  items: { day: string }[];
}

interface MealItem {
  id: string;
  name: string;
  content: string;
}

interface NutritionPlan {
  id: string;
  number: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goal: string;
  status?: string;
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  meals: MealItem[];
}

interface NutritionTemplate {
  id: string;
  name: string;
  goal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: MealItem[];
}

interface InbodyScan {
  title: string;
  bodyFat: number | null;
  weight: number | null;
  muscleMass: number | null;
  goal: string;
}

interface WeightLogPoint {
  weight: number | null;
  reps: number | null;
  sets: number | null;
  date: string;
  sessionNotes: string;
}

interface WeightLogExercise {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  latest: WeightLogPoint | null;
  history: WeightLogPoint[];
}

interface MealLogEntry {
  description: string;
  quantityGrams: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  date: string;
}

interface FollowupEntry {
  id: string;
  number?: number;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
  thigh: number | null;
  trainerNotes: string;
  memberNotes: string;
}

interface HealthData {
  inbodyScans: InbodyScan[];
  weightLogs: WeightLogExercise[];
  mealLogs: MealLogEntry[];
  followups: FollowupEntry[];
}

// ─── Constants & Day Names ───

const DAY_KEYS = [
  { ar: "اليوم الاول", en: "Day 1", fullAr: "الأحد", fullEn: "Sunday" },
  { ar: "اليوم الثاني", en: "Day 2", fullAr: "الإثنين", fullEn: "Monday" },
  { ar: "اليوم الثالث", en: "Day 3", fullAr: "الثلاثاء", fullEn: "Tuesday" },
  { ar: "اليوم الرابع", en: "Day 4", fullAr: "الأربعاء", fullEn: "Wednesday" },
  { ar: "اليوم الخامس", en: "Day 5", fullAr: "الخميس", fullEn: "Thursday" },
  { ar: "اليوم السادس", en: "Day 6", fullAr: "الجمعة", fullEn: "Friday" },
  { ar: "اليوم السابع", en: "Day 7", fullAr: "السبت", fullEn: "Saturday" },
];

const FULL_WEEKDAYS_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const FULL_WEEKDAYS_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function displayExerciseName(name: string): string {
  return name.replace(/\s*\([^)؀-ۿ]*\)\s*$/, "").trim() || name;
}

function HealthSection({
  id,
  title,
  count,
  expanded,
  onToggle,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => onToggle(id)}
            className="flex-1 flex items-center gap-2 cursor-pointer text-start"
          >
            <span className="text-sm font-bold text-foreground">{title}</span>
            <span className="text-3xs px-2 py-0.5 bg-card-hover border border-border rounded-full font-bold text-foreground/70">
              {count}
            </span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {action}
            <button onClick={() => onToggle(id)} className="cursor-pointer text-foreground/70 hover:text-foreground">
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        {expanded && (
          <div className="mt-4 pt-4 border-t border-border animate-fade-in">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TraineeSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const traineeId = params?.id;

  // ── State ──
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [anchorDay, setAnchorDay] = useState(0);
  const [memberName, setMemberName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Whether the trainer has taken over this trainee's workout plan
  // (PLAN_MANAGED_BY_TRAINER on جدول المتدربين) — while true, the
  // trainee cannot edit their own schedule from their side (see the
  // matching comment in the member-facing workouts page).
  const [managedByTrainer, setManagedByTrainer] = useState(false);
  const [togglingPlanManagement, setTogglingPlanManagement] = useState(false);
  const [planFeedbackMsg, setPlanFeedbackMsg] = useState<string | null>(null);

  // Active Tab: Workout Plan | Nutrition Plan | Health & Progress
  const [activeTab, setActiveTab] = useState<"plan" | "nutrition" | "health">("plan");

  // Workout Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(null);
  const [formDetails, setFormDetails] = useState<Record<string, ExerciseSetsReps>>({});
  const [formQuery, setFormQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Workout Templates
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [showWorkoutTemplateModal, setShowWorkoutTemplateModal] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  // ── Nutrition State ──
  const [nutritionPlan, setNutritionPlan] = useState<NutritionPlan | null>(null);
  const [nutritionTemplates, setNutritionTemplates] = useState<NutritionTemplate[]>([]);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showNutritionTemplateModal, setShowNutritionTemplateModal] = useState(false);
  const [nutritionSaving, setNutritionSaving] = useState(false);
  const [nutritionSavedMsg, setNutritionSavedMsg] = useState(false);
  const [applyingNutrTemplateId, setApplyingNutrTemplateId] = useState<string | null>(null);
  const [nutrErrorMsg, setNutrErrorMsg] = useState<string | null>(null);
  const [nutritionForm, setNutritionForm] = useState({
    calories: "2200",
    protein: "150",
    carbs: "220",
    fat: "60",
    goal: "زيادة العضل",
    meals: [
      { id: "m_1", name: "وجبة 1 (إفطار)", content: "4 بيضات مسلوقة + 80غ شوفان مع حليب وتوت" },
      { id: "m_2", name: "سناك 1 (صباحي)", content: "تفاحة + 30غ مكسرات نية" },
      { id: "m_3", name: "وجبة 2 (غداء)", content: "200غ صدر دجاج مشوي + 150غ أرز بسمتي + صحن سلطة خضراء" },
      { id: "m_4", name: "سناك 2 (قبل/بعد التمرين)", content: "موزة + سكوب واي بروتين" },
      { id: "m_5", name: "وجبة 3 (عشاء)", content: "علبة تونا مصفاة + بطاطا حلوة مشوية 150غ + حبة أفوكادو" },
      { id: "m_6", name: "سناك 3 (قبل النوم)", content: "كوب لبن يوناني أو كازين" },
    ] as MealItem[],
  });

  // ── Health State ──
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [followupForm, setFollowupForm] = useState({
    weight: "",
    bodyFat: "",
    waist: "",
    chest: "",
    arm: "",
    thigh: "",
    trainerNotes: "",
  });
  const [followupSaving, setFollowupSaving] = useState(false);
  const [followupSaved, setFollowupSaved] = useState(false);

  const [showInbodyForm, setShowInbodyForm] = useState(false);
  const [inbodyForm, setInbodyForm] = useState({ weight: "", muscleMass: "", bodyFat: "" });
  const [inbodySaving, setInbodySaving] = useState(false);
  const [inbodySaved, setInbodySaved] = useState(false);

  const [expandedInbodyIdx, setExpandedInbodyIdx] = useState<number | null>(null);
  const [expandedHealthSection, setExpandedHealthSection] = useState<string | null>("followups");

  // ── Fetch Schedules ──
  const fetchSchedule = useCallback(() => {
    if (!traineeId) return Promise.resolve();
    return fetch(`/api/trainer/trainees/${traineeId}/schedule`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((res) => {
        setSchedules(res.data || []);
        setAnchorDay(res.anchorDay || 0);
        setMemberName(res.memberName || "");
        setManagedByTrainer(Boolean(res.managedByTrainer));
      })
      .catch(() => setError(true));
  }, [traineeId]);

  // ── Toggle Plan Management (Trainer vs Trainee) ──
  const togglePlanManagement = async (targetState: boolean) => {
    if (togglingPlanManagement || !traineeId) return;
    setTogglingPlanManagement(true);
    try {
      const res = await fetch(`/api/trainer/trainees/${traineeId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ managedByTrainer: targetState }),
      });
      if (res.ok) {
        setManagedByTrainer(targetState);
        setPlanFeedbackMsg(
          targetState
            ? isAr ? "تم تحويل إدارة الخطة للمدرب بالكامل" : "Plan control taken over by trainer"
            : isAr ? "تم إرجاع إدارة الخطة للمتدرب بنجاح" : "Plan management returned to the trainee"
        );
        window.setTimeout(() => setPlanFeedbackMsg(null), 3500);
      }
    } catch (err) {
      console.error("Failed to toggle plan management:", err);
    } finally {
      setTogglingPlanManagement(false);
    }
  };

  // ── Fetch Nutrition ──
  const fetchNutrition = useCallback(() => {
    if (!traineeId) return;
    setNutritionLoading(true);
    fetch(`/api/trainer/trainees/${traineeId}/nutrition`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) {
          setNutritionPlan(res.data.plan);
          setNutritionTemplates(res.data.templates || []);
          if (res.data.plan) {
            setNutritionForm({
              calories: String(res.data.plan.calories || 2000),
              protein: String(res.data.plan.protein || 140),
              carbs: String(res.data.plan.carbs || 200),
              fat: String(res.data.plan.fat || 50),
              goal: res.data.plan.goal || "تنشيف وبناء عضل",
              meals: res.data.plan.meals && res.data.plan.meals.length > 0
                ? res.data.plan.meals
                : [
                    { id: "m_1", name: "وجبة 1 (إفطار)", content: "" },
                    { id: "m_2", name: "سناك 1 (صباحي)", content: "" },
                    { id: "m_3", name: "وجبة 2 (غداء)", content: "" },
                    { id: "m_4", name: "سناك 2 (قبل/بعد التمرين)", content: "" },
                    { id: "m_5", name: "وجبة 3 (عشاء)", content: "" },
                    { id: "m_6", name: "سناك 3 (قبل النوم)", content: "" },
                  ],
            });
          }
        }
      })
      .finally(() => setNutritionLoading(false));
  }, [traineeId]);

  // ── Fetch Health ──
  const fetchHealth = useCallback(() => {
    if (!traineeId) return;
    setHealthLoading(true);
    fetch(`/api/trainer/trainees/${traineeId}/health`, {
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setHealth(res.data);
      })
      .finally(() => setHealthLoading(false));
  }, [traineeId]);

  useEffect(() => {
    fetchSchedule()?.finally(() => setLoading(false));
  }, [fetchSchedule]);

  useEffect(() => {
    fetch("/api/workouts/exercises", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setExercises(res.data);
      });
    fetch("/api/trainer/plan-templates", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setTemplates(res.data);
      });
  }, []);

  useEffect(() => {
    if (activeTab === "nutrition") {
      fetchNutrition();
      fetchHealth();
    }
    if (activeTab === "health") fetchHealth();
  }, [activeTab, fetchNutrition, fetchHealth]);

  // ── Apply Workout Template ──
  const applyTemplate = async (templateId: string) => {
    if (applyingTemplateId != null || !traineeId) return;
    setApplyingTemplateId(templateId);
    try {
      const res = await fetch(
        `/api/trainer/trainees/${traineeId}/apply-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ templateId }),
        }
      );
      if (res.ok) {
        setShowWorkoutTemplateModal(false);
        await fetchSchedule();
        setSavedMsg(true);
        window.setTimeout(() => setSavedMsg(false), 3000);
      }
    } finally {
      setApplyingTemplateId(null);
    }
  };

  // ── Day Form Handlers ──
  const openDayForm = (idx: number) => {
    const day = DAY_KEYS[idx];
    const existing = schedules.find((s) => s.targetDay === day.ar);
    const details: Record<string, ExerciseSetsReps> = {};
    if (existing) {
      existing.items.forEach((it) => {
        details[it.exerciseId] = parseRepsSets(it.repsSets);
      });
    }
    setFormDetails(details);
    setFormQuery("");
    setEditingDayIdx(idx);
  };

  const closeDayForm = () => {
    setEditingDayIdx(null);
    setFormDetails({});
    setFormQuery("");
  };

  const toggleExercise = (exerciseId: string) => {
    setFormDetails((prev) => {
      const next = { ...prev };
      if (exerciseId in next) {
        delete next[exerciseId];
      } else {
        next[exerciseId] = { sets: "3", reps: "10" };
      }
      return next;
    });
  };

  const setExerciseSets = (exerciseId: string, value: string) => {
    setFormDetails((prev) => ({
      ...prev,
      [exerciseId]: {
        sets: value,
        reps: prev[exerciseId]?.reps ?? "10",
      },
    }));
  };

  const setExerciseReps = (exerciseId: string, value: string) => {
    setFormDetails((prev) => ({
      ...prev,
      [exerciseId]: {
        sets: prev[exerciseId]?.sets ?? "3",
        reps: value,
      },
    }));
  };

  const saveDay = async (idx: number) => {
    if (!traineeId || saving) return;
    const day = DAY_KEYS[idx];
    const existing = schedules.find((s) => s.targetDay === day.ar);
    const items = Object.entries(formDetails).map(([exerciseId, detail]) => {
      const setsStr = (detail.sets || "").trim();
      const repsStr = (detail.reps || "").trim();
      const repsSets = setsStr && repsStr
        ? `${setsStr}×${repsStr}`
        : setsStr
        ? `${setsStr} جولات`
        : repsStr
        ? `${repsStr} عدات`
        : "3×10";
      const setsNum = parseInt(setsStr, 10);
      const repsNum = parseInt(repsStr, 10);
      return {
        exerciseId,
        repsSets,
        sets: Number.isFinite(setsNum) ? setsNum : undefined,
        reps: Number.isFinite(repsNum) ? repsNum : undefined,
      };
    });

    setSaving(true);
    try {
      const url = existing
        ? `/api/trainer/trainees/${traineeId}/schedule/${existing.id}`
        : `/api/trainer/trainees/${traineeId}/schedule`;
      const method = existing ? "PATCH" : "POST";
      const body = existing
        ? { items }
        : { targetDay: day.ar, planName: day.ar, items };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        closeDayForm();
        await fetchSchedule();
        setSavedMsg(true);
        window.setTimeout(() => setSavedMsg(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteDay = async (scheduleId: string) => {
    if (!traineeId || deletingId) return;
    setDeletingId(scheduleId);
    try {
      const res = await fetch(
        `/api/trainer/trainees/${traineeId}/schedule/${scheduleId}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (res.ok) {
        await fetchSchedule();
        setSavedMsg(true);
        window.setTimeout(() => setSavedMsg(false), 3000);
      }
    } finally {
      setDeletingId(null);
    }
  };

  // ── Dynamic Meals in Nutrition Form ──
  const handleAddMeal = () => {
    setNutritionForm((prev) => {
      const nextIdx = prev.meals.length + 1;
      const isSnack = nextIdx % 2 === 0;
      return {
        ...prev,
        meals: [
          ...prev.meals,
          {
            id: `m_${Date.now()}`,
            name: isSnack ? `سناك ${Math.ceil(nextIdx / 2)}` : `وجبة ${Math.ceil(nextIdx / 2)}`,
            content: "",
          },
        ],
      };
    });
  };

  const handleRemoveMeal = (mealId: string) => {
    setNutritionForm((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== mealId),
    }));
  };

  const handleUpdateMeal = (mealId: string, key: "name" | "content", val: string) => {
    setNutritionForm((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => (m.id === mealId ? { ...m, [key]: val } : m)),
    }));
  };

  // ── Save Nutrition Form ──
  const handleSaveNutrition = async () => {
    if (!traineeId || nutritionSaving) return;
    setNutritionSaving(true);
    setNutrErrorMsg(null);
    try {
      const res = await fetch(`/api/trainer/trainees/${traineeId}/nutrition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          calories: Number(nutritionForm.calories) || 0,
          protein: Number(nutritionForm.protein) || 0,
          carbs: Number(nutritionForm.carbs) || 0,
          fat: Number(nutritionForm.fat) || 0,
          goal: nutritionForm.goal.trim(),
          meals: nutritionForm.meals,
        }),
      });

      if (res.ok) {
        setShowNutritionModal(false);
        setShowNutritionTemplateModal(false);
        setNutritionSavedMsg(true);
        window.setTimeout(() => setNutritionSavedMsg(false), 3000);
        fetchNutrition();
      } else {
        const errJson = await res.json().catch(() => null);
        setNutrErrorMsg(errJson?.message || (isAr ? "فشل حفظ الخطة الغذائية" : "Failed to save nutrition plan"));
        window.setTimeout(() => setNutrErrorMsg(null), 4000);
      }
    } catch {
      setNutrErrorMsg(isAr ? "تعذر الاتصال بالخادم لحفظ الخطة" : "Failed to connect to server");
      window.setTimeout(() => setNutrErrorMsg(null), 4000);
    } finally {
      setNutritionSaving(false);
    }
  };

  const handleApplyNutritionTemplate = async (t: NutritionTemplate) => {
    const nextForm = {
      calories: String(t.calories || 2000),
      protein: String(t.protein || 140),
      carbs: String(t.carbs || 200),
      fat: String(t.fat || 50),
      goal: t.goal || t.name,
      meals: t.meals && t.meals.length > 0 ? t.meals : nutritionForm.meals,
    };
    setNutritionForm(nextForm);

    // Instant save applied template
    if (!traineeId) return;
    setNutritionSaving(true);
    setApplyingNutrTemplateId(t.id);
    setNutrErrorMsg(null);
    try {
      const res = await fetch(`/api/trainer/trainees/${traineeId}/nutrition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          calories: Number(nextForm.calories) || 0,
          protein: Number(nextForm.protein) || 0,
          carbs: Number(nextForm.carbs) || 0,
          fat: Number(nextForm.fat) || 0,
          goal: nextForm.goal.trim(),
          meals: nextForm.meals,
        }),
      });
      if (res.ok) {
        setShowNutritionTemplateModal(false);
        setNutritionSavedMsg(true);
        window.setTimeout(() => setNutritionSavedMsg(false), 3000);
        fetchNutrition();
      } else {
        const errJson = await res.json().catch(() => null);
        setNutrErrorMsg(errJson?.message || (isAr ? "فشل تطبيق القالب الغذائي" : "Failed to apply nutrition template"));
        window.setTimeout(() => setNutrErrorMsg(null), 4000);
      }
    } catch {
      setNutrErrorMsg(isAr ? "تعذر الاتصال بالخادم لتطبيق القالب" : "Connection error while applying template");
      window.setTimeout(() => setNutrErrorMsg(null), 4000);
    } finally {
      setNutritionSaving(false);
      setApplyingNutrTemplateId(null);
    }
  };

  // ── Inbody & Followup Handlers ──
  const submitInbody = async () => {
    if (!traineeId || inbodySaving) return;
    const w = parseFloat(inbodyForm.weight);
    const m = parseFloat(inbodyForm.muscleMass);
    const f = parseFloat(inbodyForm.bodyFat);
    if (isNaN(w) && isNaN(m) && isNaN(f)) return;

    setInbodySaving(true);
    try {
      const res = await fetch(`/api/trainer/trainees/${traineeId}/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          type: "inbody",
          weight: isNaN(w) ? null : w,
          muscleMass: isNaN(m) ? null : m,
          bodyFat: isNaN(f) ? null : f,
        }),
      });
      if (res.ok) {
        setShowInbodyForm(false);
        setInbodyForm({ weight: "", muscleMass: "", bodyFat: "" });
        setInbodySaved(true);
        window.setTimeout(() => setInbodySaved(false), 3000);
        fetchHealth();
      }
    } finally {
      setInbodySaving(false);
    }
  };

  const submitFollowup = async () => {
    if (!traineeId || followupSaving) return;
    setFollowupSaving(true);
    try {
      const res = await fetch(`/api/trainer/trainees/${traineeId}/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          type: "followup",
          weight: followupForm.weight ? parseFloat(followupForm.weight) : null,
          bodyFat: followupForm.bodyFat ? parseFloat(followupForm.bodyFat) : null,
          waist: followupForm.waist ? parseFloat(followupForm.waist) : null,
          chest: followupForm.chest ? parseFloat(followupForm.chest) : null,
          arm: followupForm.arm ? parseFloat(followupForm.arm) : null,
          thigh: followupForm.thigh ? parseFloat(followupForm.thigh) : null,
          trainerNotes: followupForm.trainerNotes,
        }),
      });
      if (res.ok) {
        setShowFollowupForm(false);
        setFollowupForm({
          weight: "",
          bodyFat: "",
          waist: "",
          chest: "",
          arm: "",
          thigh: "",
          trainerNotes: "",
        });
        setFollowupSaved(true);
        window.setTimeout(() => setFollowupSaved(false), 3000);
        fetchHealth();
      }
    } finally {
      setFollowupSaving(false);
    }
  };

  const Back = isAr ? ArrowRight : ArrowLeft;
  const filteredExercises = exercises.filter((e) =>
    e.name.toLowerCase().includes(formQuery.toLowerCase())
  );
  const selectedIds = Object.keys(formDetails);

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-16">
      {/* ── Top Header Navigation ── */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/trainer")}
          className="inline-flex items-center gap-2 text-sm font-bold text-foreground/70 hover:text-foreground transition-colors cursor-pointer"
        >
          <Back className="w-4 h-4" />
          <span>{t("trainer.trainees.back")}</span>
        </button>

        {activeTab === "plan" && !loading && !error && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm",
              editMode
                ? "bg-card-hover border border-border text-foreground hover:bg-card"
                : "bg-accent text-accent-foreground hover:brightness-110 shadow-md"
            )}
          >
            {editMode ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            <span>{editMode ? (isAr ? "إنهاء التعديل" : "Done") : isAr ? "تعديل الجدول يدوياً" : "Manual Edit"}</span>
          </button>
        )}
      </div>

      {/* ── Trainee Overview Hero Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-5 sm:p-6 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center font-black text-xl shrink-0 shadow-md">
              {memberName ? memberName.slice(0, 1).toUpperCase() : "?"}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground">
                {memberName || "—"}
              </h1>
              <p className="text-xs text-foreground/70 mt-0.5">
                {isAr ? "الملف التدريبي والغذائي الشامل للمتدرب" : "Trainee Workout & Nutrition Hub"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {managedByTrainer ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? "تحكم كامل للمدرب" : "Trainer Managed"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isAr ? "المتدرب يدير خطته بنفسه" : "Self-managed"}</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => togglePlanManagement(!managedByTrainer)}
              disabled={togglingPlanManagement}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-card-hover border border-border hover:border-accent text-foreground/80 hover:text-foreground transition-all cursor-pointer disabled:opacity-50"
              title={managedByTrainer ? (isAr ? "إرجاع التحكم للمتدرب" : "Release to trainee") : (isAr ? "استلام التحكم بالكامل" : "Take over control")}
            >
              {togglingPlanManagement ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : managedByTrainer ? (
                <Undo2 className="w-3.5 h-3.5 text-foreground/70" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-accent" />
              )}
              <span>
                {managedByTrainer
                  ? (isAr ? "إرجاع للمتدرب" : "Release")
                  : (isAr ? "استلام التحكم" : "Take Over")}
              </span>
            </button>
          </div>
        </div>

        {/* ── 3 Clean Navigation Tabs ── */}
        <div className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-border/60">
          <button
            onClick={() => setActiveTab("plan")}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
              activeTab === "plan"
                ? "bg-accent text-accent-foreground shadow-md scale-[1.02]"
                : "bg-background/60 text-foreground/70 hover:text-foreground hover:bg-background/90"
            )}
          >
            <Dumbbell className="w-4 h-4" />
            <span>{isAr ? "الجدول التدريبي" : "Workout Plan"}</span>
          </button>

          <button
            onClick={() => setActiveTab("nutrition")}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
              activeTab === "nutrition"
                ? "bg-accent text-accent-foreground shadow-md scale-[1.02]"
                : "bg-background/60 text-foreground/70 hover:text-foreground hover:bg-background/90"
            )}
          >
            <Apple className="w-4 h-4" />
            <span>{isAr ? "الخطة الغذائية" : "Nutrition Plan"}</span>
          </button>

          <button
            onClick={() => setActiveTab("health")}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
              activeTab === "health"
                ? "bg-accent text-accent-foreground shadow-md scale-[1.02]"
                : "bg-background/60 text-foreground/70 hover:text-foreground hover:bg-background/90"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            <span>{isAr ? "الصحة والقياسات" : "Health & Body"}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {savedMsg && (
        <div className="bg-success/15 border border-success/30 rounded-2xl p-3.5 flex items-center gap-2.5 animate-fade-in">
          <Check className="w-4 h-4 text-success" />
          <span className="text-xs font-bold text-success">
            {isAr ? "تم حفظ وتطبيق الخطة بنجاح" : "Plan saved and applied successfully"}
          </span>
        </div>
      )}

      {planFeedbackMsg && (
        <div className="bg-success/15 border border-success/30 rounded-2xl p-3.5 flex items-center gap-2.5 animate-fade-in">
          <Check className="w-4 h-4 text-success" />
          <span className="text-xs font-bold text-success">
            {planFeedbackMsg}
          </span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 1: 🏋️‍♂️ WORKOUT SCHEDULE (Full Day Names & Template Button)
         ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "plan" && (
        <div className="space-y-4">
          {/* Plan Managed By Trainer Notice — lets the trainer hand plan
              editing back to the trainee (clears PLAN_MANAGED_BY_TRAINER
              via PATCH .../schedule). Only shown while it's actually set. */}
          {/* Plan Control Toggle Card — Permanent, two-way control (never disappears) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  managedByTrainer ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"
                )}
              >
                {managedByTrainer ? <Sparkles className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs sm:text-sm font-bold text-foreground">
                    {managedByTrainer
                      ? (isAr ? "التحكم بالجدول: للمدرب بالكامل" : "Plan Control: Trainer Managed")
                      : (isAr ? "التحكم بالجدول: للمتدرب بنفسه" : "Plan Control: Trainee Self-Managed")}
                  </p>
                  <span
                    className={cn(
                      "text-3xs px-2 py-0.5 rounded-full font-bold border",
                      managedByTrainer
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    )}
                  >
                    {managedByTrainer ? (isAr ? "مفعّل للمدرب" : "Active") : (isAr ? "حر للمتدرب" : "Self")}
                  </span>
                </div>
                <p className="text-2xs text-foreground/70 mt-0.5">
                  {managedByTrainer
                    ? (isAr ? "المتدرب لا يستطيع تعديل جدوله من تطبيقه، التحكم بيدك كمدرب." : "Trainee cannot edit workouts; only you manage this schedule.")
                    : (isAr ? "المتدرب يستطيع تعديل وتخصيص جدوله بحرية من تطبيقه." : "Trainee can freely customize and edit their split in their app.")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => togglePlanManagement(!managedByTrainer)}
              disabled={togglingPlanManagement}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 shadow-xs min-h-[40px] disabled:opacity-60",
                managedByTrainer
                  ? "bg-card-hover border border-border text-foreground hover:bg-muted"
                  : "bg-accent text-accent-foreground hover:brightness-110"
              )}
            >
              {togglingPlanManagement ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : managedByTrainer ? (
                <Undo2 className="w-3.5 h-3.5 text-foreground/70" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {togglingPlanManagement
                  ? (isAr ? "جاري التحديث..." : "Updating...")
                  : managedByTrainer
                  ? (isAr ? "إرجاع التحكم للمتدرب" : "Release to Trainee")
                  : (isAr ? "استلام التحكم بالكامل" : "Take Over Control")}
              </span>
            </button>
          </div>

          {/* Quick Apply Template Action Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border border-border/80 overflow-hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                <LayoutTemplate className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground">
                  {isAr ? "تطبيق قالب جدول تمارين جاهز" : "Apply Pre-Made Workout Template"}
                </p>
                <p className="text-2xs text-foreground/70">
                  {isAr ? "استبدال جدول المتدرب بضغطة زر واحدة بقالب محفوظ" : "Apply a ready-made split in 1 click"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowWorkoutTemplateModal(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-xs shrink-0 w-full sm:w-auto"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isAr ? "اختيار قالب" : "Choose Template"}</span>
            </button>
          </div>

          {/* Workout Template Drawer */}
          {showWorkoutTemplateModal && (
            <Portal>
              <div className="fixed inset-0 z-[100] flex justify-end animate-fade-in">
                <div
                  onClick={() => setShowWorkoutTemplateModal(false)}
                  className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity cursor-pointer"
                />
                <div
                  className="relative z-10 flex max-w-full w-full sm:max-w-md bg-card border-s border-border shadow-2xl flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
                >
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/70 bg-card shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                        <LayoutTemplate className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-foreground truncate">
                          {isAr ? "اختيار قالب جدول تمارين" : "Select Workout Template"}
                        </h3>
                        <p className="text-2xs text-foreground/70 truncate">
                          {isAr ? "تطبيق قالب تمارين مجهز مسبقاً" : "Apply pre-made workout plan"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowWorkoutTemplateModal(false)}
                      className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                      aria-label={isAr ? "إغلاق" : "Close"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-2 overscroll-contain">
                    {templates.length === 0 ? (
                      <p className="text-xs text-foreground/70 text-center py-12">
                        {isAr ? "لا توجد قوالب تمارين محفوظة — يمكنك إنشاؤها من صفحة «الخطط الجاهزة»" : "No saved templates"}
                      </p>
                    ) : (
                      templates.map((tpl) => {
                        const dayCount = new Set(tpl.items.map((it) => it.day)).size;
                        const isApplying = applyingTemplateId === tpl.id;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl.id)}
                            disabled={applyingTemplateId != null}
                            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-background border border-border/80 hover:border-accent text-start transition-all cursor-pointer disabled:opacity-60 group"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate group-hover:text-accent transition-colors">{tpl.name}</p>
                              <p className="text-3xs text-foreground/70 mt-0.5">{isAr ? `${dayCount} أيام تدريب (${tpl.items.length} تمرين)` : `${dayCount} days`}</p>
                            </div>
                            {isApplying ? (
                              <div className="w-4 h-4 border-2 border-border border-t-accent rounded-full animate-spin shrink-0" />
                            ) : (
                              <span className="text-xs font-bold text-accent shrink-0">
                                {isAr ? "تطبيق ←" : "Apply →"}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="p-4 sm:p-5 border-t border-border/70 bg-card shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                      type="button"
                      onClick={() => setShowWorkoutTemplateModal(false)}
                      className="w-full py-3 rounded-2xl text-xs font-bold bg-card-hover border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer min-h-[44px]"
                    >
                      {isAr ? "إغلاق" : "Close"}
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}

          {/* Schedule List (One Clean Card Per Day with Full Arabic Name) */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-sm text-destructive">{t("common.error")}</p>
              </CardContent>
            </Card>
          ) : (
            DAY_KEYS.map((day, idx) => {
              const entry = schedules.find((s) => s.targetDay === day.ar);
              const weekdayIdx = (anchorDay + idx) % 7;
              const fullDayName = isAr ? FULL_WEEKDAYS_AR[weekdayIdx] : FULL_WEEKDAYS_EN[weekdayIdx];
              const isEditingThisDay = editingDayIdx === idx;
              const exerciseCount = entry?.items?.length || 0;

              return (
                <Card key={idx} className="overflow-hidden border border-border/80 transition-all">
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-3 bg-card-hover/50 border-b border-border/60">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 text-accent flex items-center justify-center font-bold text-sm shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-foreground">
                            {fullDayName}
                          </h3>
                          <span
                            className={cn(
                              "text-3xs font-bold px-2.5 py-0.5 rounded-full border",
                              exerciseCount > 0
                                ? "bg-primary text-primary-foreground border-primary/30"
                                : "bg-muted/10 text-foreground/70 border-border/60"
                            )}
                          >
                            {exerciseCount > 0
                              ? isAr ? `${exerciseCount} تمارين` : `${exerciseCount} exercises`
                              : isAr ? "يوم راحة" : "Rest Day"}
                          </span>
                        </div>
                        {entry?.planName && entry.planName !== day.ar && (
                          <p className="text-xs text-foreground/70 font-semibold mt-0.5 truncate">
                            {entry.planName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Day Action Buttons */}
                    {editMode ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                isEditingThisDay ? closeDayForm() : openDayForm(idx)
                              }
                              className="w-8 h-8 rounded-xl flex items-center justify-center bg-card-hover border border-border text-foreground/70 hover:text-foreground hover:border-primary/40 transition-all cursor-pointer"
                              title={isAr ? "تعديل تمارين اليوم" : "Edit exercises"}
                            >
                              {isEditingThisDay ? <X className="w-4 h-4" /> : <Pencil className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDay(entry.id)}
                              disabled={deletingId === entry.id}
                              className="w-8 h-8 rounded-xl flex items-center justify-center bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-all cursor-pointer disabled:opacity-50"
                              title={isAr ? "حذف تمارين اليوم" : "Delete day"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              isEditingThisDay ? closeDayForm() : openDayForm(idx)
                            }
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-xs"
                          >
                            {isEditingThisDay ? (
                              <X className="w-3.5 h-3.5" />
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{isAr ? "إضافة تمارين" : "Add"}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {/* Day Content */}
                  <div className="p-4 sm:p-5">
                    {isEditingThisDay ? (
                      <div className="bg-background rounded-2xl p-4 space-y-4 border border-border animate-fade-in">
                        {selectedIds.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-1 text-3xs font-bold text-accent">
                              <span>{isAr ? "التمارين المختارة:" : "Selected Exercises:"}</span>
                              <div className="flex items-center gap-1.5 pe-8">
                                <span className="w-14 sm:w-16 text-center">{isAr ? "الجولات" : "Sets"}</span>
                                <span className="w-2 text-center text-transparent">×</span>
                                <span className="w-14 sm:w-16 text-center">{isAr ? "العدات" : "Reps"}</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {selectedIds.map((exerciseId) => {
                                const ex = exercises.find((e) => e.id === exerciseId);
                                const detail = formDetails[exerciseId] || { sets: "3", reps: "10" };
                                return (
                                  <div
                                    key={exerciseId}
                                    className="flex items-center gap-2 bg-card border border-border rounded-xl p-2.5"
                                  >
                                    <span className="text-xs sm:text-sm font-bold text-foreground flex-1 min-w-0 truncate">
                                      {ex ? displayExerciseName(ex.name) : exerciseId}
                                    </span>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <input
                                        type="number"
                                        min={1}
                                        value={detail.sets}
                                        onChange={(e) => setExerciseSets(exerciseId, e.target.value)}
                                        placeholder="3"
                                        title={isAr ? "عدد الجولات" : "Sets"}
                                        className="w-14 sm:w-16 bg-background border border-border rounded-lg px-2 py-1 text-xs font-bold text-center text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent"
                                      />
                                      <span className="text-xs font-bold text-foreground/50 select-none">×</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={detail.reps}
                                        onChange={(e) => setExerciseReps(exerciseId, e.target.value)}
                                        placeholder="10"
                                        title={isAr ? "عدد التكرارات" : "Reps"}
                                        className="w-14 sm:w-16 bg-background border border-border rounded-lg px-2 py-1 text-xs font-bold text-center text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => toggleExercise(exerciseId)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer"
                                      title={isAr ? "إزالة التمرين" : "Remove"}
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Search & Exercise Selector */}
                        <div className="relative">
                          <Search className="w-4 h-4 text-foreground/70 absolute start-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={formQuery}
                            onChange={(e) => setFormQuery(e.target.value)}
                            placeholder={isAr ? "ابحث عن تمرين لإضافته..." : "Search exercises..."}
                            className="w-full bg-card border border-border rounded-xl ps-9 pe-4 py-2.5 text-xs text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-accent"
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1 pe-1">
                          {filteredExercises.slice(0, 30).map((ex) => {
                            const isSelected = ex.id in formDetails;
                            return (
                              <button
                                key={ex.id}
                                type="button"
                                onClick={() => toggleExercise(ex.id)}
                                className={cn(
                                  "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all text-start cursor-pointer",
                                  isSelected
                                    ? "bg-primary text-primary-foreground border border-primary/40"
                                    : "bg-card border border-border/60 text-foreground/70 hover:text-foreground hover:bg-card-hover"
                                )}
                              >
                                <span className="truncate">{displayExerciseName(ex.name)}</span>
                                <span className="text-3xs text-foreground/70 shrink-0">{ex.muscleGroup}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Save & Cancel */}
                        <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                          <button
                            type="button"
                            onClick={() => saveDay(idx)}
                            disabled={saving || selectedIds.length === 0}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {saving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ التمارين" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={closeDayForm}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-card border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer"
                          >
                            {isAr ? "إلغاء" : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ) : !entry || entry.items.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-foreground/70 bg-card-hover/30 rounded-2xl border border-dashed border-border/60">
                        <Sparkles className="w-4 h-4 text-accent/60" />
                        <span>{isAr ? "يوم راحة واستشفاء عضلي" : "Rest & Recovery Day"}</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {entry.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 bg-card-hover/80 border border-border/60 rounded-2xl p-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-primary/15 text-accent flex items-center justify-center shrink-0">
                                <Dumbbell className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-foreground truncate">
                                {displayExerciseName(item.exerciseName)}
                              </span>
                            </div>
                            {item.repsSets && (
                              <span className="text-xs font-black text-primary-foreground bg-primary px-2.5 py-1 rounded-lg shrink-0">
                                {item.repsSets}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 2: 🥗 NUTRITION PLAN MANAGER (6 Discrete Meals & Template Picker)
         ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "nutrition" && (
        <div className="space-y-5 animate-fade-in">
          {/* Action Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-foreground">
                {isAr ? "البرنامج الغذائي المخصص" : "Custom Nutrition Plan"}
              </h2>
              <p className="text-xs text-foreground/70">
                {isAr ? "تحديد السعرات، نسب الماكروز، والوجبات والسناكات الـ 6" : "Set calories, macros, and 6 meals/snacks"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowNutritionTemplateModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-card border border-border hover:border-accent text-foreground transition-all cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-accent" />
                <span>{isAr ? "تطبيق قالب جاهز" : "Apply Template"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowNutritionModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md"
              >
                {nutritionPlan ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{nutritionPlan ? (isAr ? "تعديل الخطة" : "Edit Plan") : (isAr ? "إنشاء خطة" : "Create Plan")}</span>
              </button>
            </div>
          </div>

          {/* Nutrition Template Picker Drawer */}
          {showNutritionTemplateModal && (
            <Portal>
              <div className="fixed inset-0 z-[100] flex justify-end animate-fade-in">
                <div
                  onClick={() => setShowNutritionTemplateModal(false)}
                  className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity cursor-pointer"
                />
                <div
                  className="relative z-10 flex max-w-full w-full sm:max-w-md bg-card border-s border-border shadow-2xl flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
                >
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/70 bg-card shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                        <Apple className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-foreground truncate">
                          {isAr ? "اختيار قالب خطة غذائية" : "Select Nutrition Template"}
                        </h3>
                        <p className="text-2xs text-foreground/70 truncate">
                          {isAr ? "تطبيق نظام غذائي مجهز مسبقاً" : "Apply pre-made nutrition diet"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNutritionTemplateModal(false)}
                      className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                      aria-label={isAr ? "إغلاق" : "Close"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-2.5 overscroll-contain">
                    {nutrErrorMsg && (
                      <div className="bg-destructive/15 border border-destructive/30 rounded-2xl p-3.5 flex items-center gap-2.5 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        <span className="text-xs font-bold text-destructive">
                          {nutrErrorMsg}
                        </span>
                      </div>
                    )}
                    {nutritionTemplates.length === 0 ? (
                      <p className="text-xs text-foreground/70 text-center py-12">
                        {isAr ? "لا توجد قوالب غذائية محفوظة — يمكنك إنشاؤها من صفحة «الخطط الجاهزة»" : "No saved nutrition templates"}
                      </p>
                    ) : (
                      nutritionTemplates.map((tpl) => {
                        const isApplying = applyingNutrTemplateId === tpl.id;
                        return (
                          <button
                            key={tpl.id}
                            onClick={() => handleApplyNutritionTemplate(tpl)}
                            disabled={nutritionSaving}
                            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-background border border-border/80 hover:border-accent text-start transition-all cursor-pointer disabled:opacity-60 group"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate group-hover:text-accent transition-colors">{tpl.name}</p>
                              <p className="text-3xs text-foreground/70 mt-0.5">
                                {tpl.calories} kcal · {tpl.goal || "تغذية متوازنة"}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-accent shrink-0 flex items-center gap-1.5">
                              {isApplying ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>{isAr ? "جاري التطبيق..." : "Applying..."}</span>
                                </>
                              ) : (
                                <span>{isAr ? "تطبيق الخطة ←" : "Apply →"}</span>
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="p-4 sm:p-5 border-t border-border/70 bg-card shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                      type="button"
                      onClick={() => setShowNutritionTemplateModal(false)}
                      className="w-full py-3 rounded-2xl text-xs font-bold bg-card-hover border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer min-h-[44px]"
                    >
                      {isAr ? "إغلاق" : "Close"}
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}

          {nutritionSavedMsg && (
            <div className="bg-success/15 border border-success/30 rounded-2xl p-3.5 flex items-center gap-2.5 animate-fade-in">
              <Check className="w-4 h-4 text-success" />
              <span className="text-xs font-bold text-success">
                {isAr ? "تم حفظ وتحديث الخطة الغذائية بنجاح" : "Nutrition plan updated successfully"}
              </span>
            </div>
          )}

          {nutritionLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : !nutritionPlan ? (
            /* No Nutrition Plan State */
            <Card className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-primary/15 text-accent flex items-center justify-center mx-auto">
                <Utensils className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isAr ? "لم يتم تعيين خطة غذائية لهذا المتدرب بعد" : "No Nutrition Plan Assigned Yet"}
                </h3>
                <p className="text-xs text-foreground/70 max-w-md mx-auto mt-1">
                  {isAr
                    ? "يمكنك كمدرب تصميم خطة غذائية كاملة بالسعرات والماكروز وتوزيع الوجبات والسناكات أو تطبيق قالب جاهز بنقرة واحدة."
                    : "Create a tailored diet plan with daily macros and 6 meals for your trainee."}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNutritionTemplateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-card border border-border hover:border-accent transition-all cursor-pointer"
                >
                  <Zap className="w-4 h-4 text-accent" />
                  <span>{isAr ? "تطبيق قالب جاهز" : "Apply Template"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNutritionModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAr ? "إنشاء وتخصيص خطة جديدة" : "Create Plan Now"}</span>
                </button>
              </div>
            </Card>
          ) : (
            /* Active Nutrition Plan Card */
            <div className="space-y-4">
              {/* Daily Target & Macros Banner */}
              <Card className="p-5 sm:p-6 bg-card border border-border/80 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                      <Flame className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground/70 uppercase">
                        {isAr ? "الهدف الغذائي الحالي" : "Nutrition Goal"}
                      </p>
                      <h3 className="text-base font-black text-foreground">
                        {nutritionPlan.goal || (isAr ? "خطة تغذية متوازنة" : "Balanced Diet")}
                      </h3>
                    </div>
                  </div>

                  <div className="px-3.5 py-1.5 rounded-xl bg-primary border border-primary/30 text-primary-foreground font-black text-sm text-center">
                    <span className="tabular-nums">{nutritionPlan.calories || 0}</span>{" "}
                    <span className="text-xs font-semibold">{isAr ? "سعرة / يوم" : "kcal / day"}</span>
                  </div>
                </div>

                {/* Macro Breakdown Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-2xl bg-background/80 border border-border/60 text-center">
                    <p className="text-xs font-bold text-foreground/70">{isAr ? "البروتين" : "Protein"}</p>
                    <p className="text-lg sm:text-xl font-black text-foreground mt-0.5 tabular-nums">
                      {nutritionPlan.protein || 0} <span className="text-xs font-normal text-foreground/70">{isAr ? "غ" : "g"}</span>
                    </p>
                    <div className="w-full bg-card-hover h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-red-500 h-full w-[70%]" />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-background/80 border border-border/60 text-center">
                    <p className="text-xs font-bold text-foreground/70">{isAr ? "الكاربوهيدرات" : "Carbs"}</p>
                    <p className="text-lg sm:text-xl font-black text-foreground mt-0.5 tabular-nums">
                      {nutritionPlan.carbs || 0} <span className="text-xs font-normal text-foreground/70">{isAr ? "غ" : "g"}</span>
                    </p>
                    <div className="w-full bg-card-hover h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-amber-500 h-full w-[60%]" />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-background/80 border border-border/60 text-center">
                    <p className="text-xs font-bold text-foreground/70">{isAr ? "الدهون الصحية" : "Fats"}</p>
                    <p className="text-lg sm:text-xl font-black text-foreground mt-0.5 tabular-nums">
                      {nutritionPlan.fat || 0} <span className="text-xs font-normal text-foreground/70">{isAr ? "غ" : "g"}</span>
                    </p>
                    <div className="w-full bg-card-hover h-1.5 rounded-full mt-2 overflow-hidden">
                      <div className="bg-blue-500 h-full w-[40%]" />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Dynamic 6 Meals & Snacks Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black text-foreground">
                    {isAr ? "جدول الوجبات والسناكات المخصصة:" : "Daily Meals & Snacks:"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowNutritionModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline cursor-pointer"
                  >
                    <span>{isAr ? "تعديل الوجبات" : "Edit Meals"}</span>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                {(nutritionPlan.meals || []).map((meal, idx) => {
                  const isBreakfast = idx === 0 || meal.name.includes("فطور") || meal.name.includes("إفطار");
                  const isLunch = idx === 2 || meal.name.includes("غداء");
                  const isDinner = idx === 4 || meal.name.includes("عشاء");

                  const icon = isBreakfast ? (
                    <Coffee className="w-4 h-4 text-amber-400" />
                  ) : isLunch ? (
                    <SunMedium className="w-4 h-4 text-red-400" />
                  ) : isDinner ? (
                    <Moon className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Apple className="w-4 h-4 text-emerald-400" />
                  );

                  return (
                    <Card key={meal.id || idx} className="p-4 sm:p-5 space-y-2 border border-border/70">
                      <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
                        <div className="w-7 h-7 rounded-lg bg-card-hover flex items-center justify-center shrink-0">
                          {icon}
                        </div>
                        <h4 className="text-sm font-bold text-foreground">
                          {meal.name}
                        </h4>
                      </div>
                      <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-line pt-1">
                        {meal.content || (isAr ? "—" : "—")}
                      </p>
                    </Card>
                  );
                })}
              </div>

              {/* Actual Logged Meals Section in Tab 2 */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-black text-foreground">
                      {isAr ? "سجل ما تناوله المتدرب فعلياً:" : "What Trainee Actually Ate:"}
                    </h3>
                  </div>
                  {health?.mealLogs && (
                    <span className="text-3xs px-2.5 py-0.5 rounded-full bg-card border border-border font-bold text-foreground/70">
                      {health.mealLogs.length} {isAr ? "صنف مسجل" : "logged items"}
                    </span>
                  )}
                </div>

                {!health?.mealLogs || health.mealLogs.length === 0 ? (
                  <Card className="p-5 text-center text-foreground/70 border border-dashed border-border/80">
                    <p className="text-xs font-semibold">
                      {isAr ? "لا توجد وجبات مسجلة من المتدرب بعد عبر حاسبة السعرات" : "No meals logged by trainee yet"}
                    </p>
                  </Card>
                ) : (
                  <TraineeMealLogsCalendar mealLogs={health.mealLogs} isAr={isAr} />
                )}
              </div>
            </div>
          )}

          {/* Edit Nutrition Drawer */}
          {showNutritionModal && (
            <Portal>
              <div className="fixed inset-0 z-[100] flex justify-end animate-fade-in">
                <div
                  onClick={() => setShowNutritionModal(false)}
                  className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity cursor-pointer"
                />
                <div
                  className="relative z-10 flex max-w-full w-full sm:max-w-xl bg-card border-s border-border shadow-2xl flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/70 bg-card shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                        <Apple className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-black text-foreground truncate">
                          {nutritionPlan ? (isAr ? "تعديل الخطة والوجبات" : "Edit Nutrition Plan") : (isAr ? "إنشاء خطة غذائية جديدة" : "New Nutrition Plan")}
                        </h3>
                        <p className="text-xs text-foreground/70 mt-0.5 truncate">
                          {isAr ? "توزيع السعرات والماكروز وتفاصيل الوجبات الـ 6" : "Configure calories, macros & 6 meals"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNutritionModal(false)}
                      className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                      aria-label={isAr ? "إغلاق" : "Close"}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Scrollable Body */}
                  <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-5 overscroll-contain">
                    {/* Goal & Calories */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs font-bold text-foreground/70 block mb-1">
                          {isAr ? "الهدف الغذائي" : "Goal"}
                        </label>
                        <select
                          value={nutritionForm.goal}
                          onChange={(e) => setNutritionForm({ ...nutritionForm, goal: e.target.value })}
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent cursor-pointer"
                        >
                          <option value="زيادة العضل">{isAr ? "زيادة العضل (تضخيم)" : "Muscle Gain"}</option>
                          <option value="تنشيف">{isAr ? "تنشيف (خسارة الدهون)" : "Cutting / Fat Loss"}</option>
                          <option value="تثبيت وزن">{isAr ? "تثبيت الوزن (محافظة)" : "Maintenance"}</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-foreground/70 block mb-1">
                          {isAr ? "السعرات اليومية (kcal)" : "Daily Calories"}
                        </label>
                        <input
                          type="number"
                          value={nutritionForm.calories}
                          onChange={(e) => setNutritionForm({ ...nutritionForm, calories: e.target.value })}
                          placeholder="2200"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    {/* Macros Breakdown */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-bold text-foreground/70 block mb-1">
                          {isAr ? "بروتين (غ)" : "Protein (g)"}
                        </label>
                        <input
                          type="number"
                          value={nutritionForm.protein}
                          onChange={(e) => setNutritionForm({ ...nutritionForm, protein: e.target.value })}
                          placeholder="150"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-foreground/70 block mb-1">
                          {isAr ? "كارب (غ)" : "Carbs (g)"}
                        </label>
                        <input
                          type="number"
                          value={nutritionForm.carbs}
                          onChange={(e) => setNutritionForm({ ...nutritionForm, carbs: e.target.value })}
                          placeholder="220"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-foreground/70 block mb-1">
                          {isAr ? "دهون (غ)" : "Fats (g)"}
                        </label>
                        <input
                          type="number"
                          value={nutritionForm.fat}
                          onChange={(e) => setNutritionForm({ ...nutritionForm, fat: e.target.value })}
                          placeholder="60"
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    {/* Discrete 6 Meals in Trainee Form */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <label className="text-xs font-black text-foreground">
                            {isAr ? "الوجبات والسناكات المخصصة:" : "Meals & Snacks:"}
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleAddMeal}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground border border-primary/30 hover:bg-primary/90 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAr ? "إضافة وجبة / سناك" : "Add Meal"}</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        {nutritionForm.meals.map((meal, idx) => (
                          <div key={meal.id || idx} className="p-3.5 bg-background border border-border/80 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={meal.name}
                                onChange={(e) => handleUpdateMeal(meal.id, "name", e.target.value)}
                                placeholder={`وجبة ${idx + 1}`}
                                className="bg-card border border-border/60 rounded-lg px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none focus:border-accent flex-1 min-w-0 max-w-xs"
                              />

                              {nutritionForm.meals.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMeal(meal.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                  title={isAr ? "حذف الوجبة" : "Remove meal"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <textarea
                              rows={2}
                              value={meal.content}
                              onChange={(e) => handleUpdateMeal(meal.id, "content", e.target.value)}
                              placeholder={isAr ? "تفاصيل الوجبة والمكونات والكميات..." : "Meal details and portions..."}
                              className="w-full bg-card border border-border/60 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-accent"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="p-4 sm:p-5 border-t border-border/70 bg-card flex items-center gap-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                      type="button"
                      onClick={handleSaveNutrition}
                      disabled={nutritionSaving}
                      className="flex-1 py-3 rounded-2xl text-xs font-black bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md disabled:opacity-50 min-h-[44px]"
                    >
                      {nutritionSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ وتثبيت الخطة" : "Save Plan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNutritionModal(false)}
                      className="px-5 py-3 rounded-2xl text-xs font-bold bg-card-hover border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer min-h-[44px]"
                    >
                      {isAr ? "إلغاء" : "Cancel"}
                    </button>
                  </div>
                </div>
              </div>
            </Portal>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          TAB 3: 📈 HEALTH & BODY MEASUREMENTS
         ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "health" && (
        <div className="space-y-4 animate-fade-in">
          {healthLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : !health ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-sm text-foreground/70">{isAr ? "لا توجد قياسات مسجلة بعد" : "No health data recorded yet"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Followups Section */}
              <HealthSection
                id="followups"
                title={isAr ? "المتابعة والقياسات الدورية" : "Progress Follow-ups"}
                count={health.followups.length}
                expanded={expandedHealthSection === "followups"}
                onToggle={(id) => setExpandedHealthSection(expandedHealthSection === id ? null : id)}
                action={
                  <button
                    onClick={() => {
                      setExpandedHealthSection("followups");
                      setShowFollowupForm((v) => !v);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer"
                  >
                    {showFollowupForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isAr ? "إضافة قياس دوري" : "Add Check-in"}</span>
                  </button>
                }
              >
                {followupSaved && (
                  <div className="bg-success/15 border border-success/30 rounded-2xl p-3 flex items-center gap-2 mb-3 animate-fade-in">
                    <Check className="w-4 h-4 text-success" />
                    <span className="text-xs font-bold text-success">{isAr ? "تم حفظ المتابعة" : "Follow-up saved"}</span>
                  </div>
                )}

                {showFollowupForm && (
                  <div className="bg-background rounded-2xl p-4 space-y-3 border border-border animate-fade-in mb-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(
                        [
                          ["weight", isAr ? "الوزن (كغ)" : "Weight (kg)"],
                          ["bodyFat", isAr ? "نسبة الدهون (%)" : "Body fat (%)"],
                          ["waist", isAr ? "محيط الخصر (سم)" : "Waist (cm)"],
                          ["chest", isAr ? "محيط الصدر (سم)" : "Chest (cm)"],
                          ["arm", isAr ? "محيط الذراع (سم)" : "Arm (cm)"],
                          ["thigh", isAr ? "محيط الفخذ (سم)" : "Thigh (cm)"],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <label className="text-3xs text-foreground/70 font-bold block mb-1">{label}</label>
                          <input
                            type="number"
                            step="0.1"
                            value={followupForm[field]}
                            onChange={(e) => setFollowupForm({ ...followupForm, [field]: e.target.value })}
                            className="w-full bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="text-3xs text-foreground/70 font-bold block mb-1">{isAr ? "ملاحظات المدرب" : "Coach Notes"}</label>
                      <textarea
                        rows={2}
                        value={followupForm.trainerNotes}
                        onChange={(e) => setFollowupForm({ ...followupForm, trainerNotes: e.target.value })}
                        placeholder={isAr ? "توجيهات للمتدرب..." : "Instructions..."}
                        className="w-full bg-card border border-border rounded-xl p-2 text-xs text-foreground focus:outline-none focus:border-accent"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={submitFollowup}
                      disabled={followupSaving}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {followupSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ المتابعة" : "Save Check-in"}
                    </button>
                  </div>
                )}

                {health.followups.length === 0 ? (
                  <p className="text-xs text-foreground/70 text-center py-4">{isAr ? "لا توجد متابعات مسجلة بعد" : "No followups recorded yet"}</p>
                ) : (
                  <div className="space-y-2">
                    {health.followups.map((f, idx) => (
                      <div key={f.id || idx} className="p-3 bg-card-hover rounded-xl border border-border/60 flex items-center justify-between gap-3 text-xs">
                        <span className="font-bold text-foreground">{f.date || `Check-in #${idx + 1}`}</span>
                        <div className="flex items-center gap-3 text-foreground/70">
                          {f.weight && <span>{f.weight} kg</span>}
                          {f.bodyFat && <span>{f.bodyFat}% fat</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </HealthSection>

              {/* InBody Section */}
              <HealthSection
                id="inbody"
                title={isAr ? "فحوصات InBody" : "InBody Scans"}
                count={health.inbodyScans.length}
                expanded={expandedHealthSection === "inbody"}
                onToggle={(id) => setExpandedHealthSection(expandedHealthSection === id ? null : id)}
                action={
                  <button
                    onClick={() => {
                      setExpandedHealthSection("inbody");
                      setShowInbodyForm((v) => !v);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer"
                  >
                    {showInbodyForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{isAr ? "إضافة فحص" : "Add Scan"}</span>
                  </button>
                }
              >
                {inbodySaved && (
                  <div className="bg-success/15 border border-success/30 rounded-2xl p-3 flex items-center gap-2 mb-3 animate-fade-in">
                    <Check className="w-4 h-4 text-success" />
                    <span className="text-xs font-bold text-success">{isAr ? "تم حفظ الفحص" : "Scan saved"}</span>
                  </div>
                )}

                {showInbodyForm && (
                  <div className="bg-background rounded-2xl p-4 space-y-3 border border-border animate-fade-in mb-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-3xs text-foreground/70 font-bold block mb-1">{isAr ? "الوزن (كغ)" : "Weight (kg)"}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={inbodyForm.weight}
                          onChange={(e) => setInbodyForm({ ...inbodyForm, weight: e.target.value })}
                          className="w-full bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-3xs text-foreground/70 font-bold block mb-1">{isAr ? "كتلة العضلات (كغ)" : "Muscle (kg)"}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={inbodyForm.muscleMass}
                          onChange={(e) => setInbodyForm({ ...inbodyForm, muscleMass: e.target.value })}
                          className="w-full bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="text-3xs text-foreground/70 font-bold block mb-1">{isAr ? "الدهون (%)" : "Body fat (%)"}</label>
                        <input
                          type="number"
                          step="0.1"
                          value={inbodyForm.bodyFat}
                          onChange={(e) => setInbodyForm({ ...inbodyForm, bodyFat: e.target.value })}
                          className="w-full bg-card border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={submitInbody}
                      disabled={inbodySaving}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {inbodySaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ الفحص" : "Save Scan"}
                    </button>
                  </div>
                )}

                {health.inbodyScans.length === 0 ? (
                  <p className="text-xs text-foreground/70 text-center py-4">{isAr ? "لا توجد فحوصات InBody مسجلة" : "No scans recorded"}</p>
                ) : (
                  <div className="space-y-2">
                    {health.inbodyScans.map((s, idx) => (
                      <div key={idx} className="p-3 bg-card-hover rounded-xl border border-border/60 flex items-center justify-between gap-3 text-xs">
                        <span className="font-bold text-foreground">{s.title || `InBody Scan #${idx + 1}`}</span>
                        <div className="flex items-center gap-3 text-foreground/70">
                          {s.weight && <span>{s.weight} kg</span>}
                          {s.bodyFat && <span>{s.bodyFat}% fat</span>}
                          {s.muscleMass && <span>{s.muscleMass} kg muscle</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </HealthSection>

              {/* Meal Logs Section — الأشياء التي أكلها المتدرب (سجل الوجبات) */}
              <HealthSection
                id="meals"
                title={isAr ? "سجل وجبات المتدرب (ما تناوله)" : "Logged Meals (What Trainee Ate)"}
                count={health.mealLogs.length}
                expanded={expandedHealthSection === "meals"}
                onToggle={(id) => setExpandedHealthSection(expandedHealthSection === id ? null : id)}
              >
                {health.mealLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-foreground/70 bg-card-hover/20 rounded-2xl border border-dashed border-border/60">
                    <Utensils className="w-8 h-8 text-foreground/40" />
                    <p className="text-xs font-bold text-foreground/80">
                      {isAr ? "لا توجد وجبات مسجلة من قبل المتدرب بعد" : "No meals logged by trainee yet"}
                    </p>
                    <p className="text-3xs text-foreground/50 max-w-xs">
                      {isAr
                        ? "عندما يقوم المتدرب بتسجيل وجباته وأطعمته من حاسبة السعرات، ستظهر تلقائياً هنا بالتفصيل."
                        : "When trainee logs foods in meal calculator, entries will automatically appear here."}
                    </p>
                  </div>
                ) : (
                  <TraineeMealLogsCalendar mealLogs={health.mealLogs} isAr={isAr} />
                )}
              </HealthSection>

              {/* Weight Logs Section — سجل أوزان التمارين */}
              <HealthSection
                id="weightLogs"
                title={isAr ? "سجل أوزان التمارين (الأوزان المرفوعة)" : "Exercise Weight Log"}
                count={health.weightLogs.length}
                expanded={expandedHealthSection === "weightLogs"}
                onToggle={(id) => setExpandedHealthSection(expandedHealthSection === id ? null : id)}
              >
                {health.weightLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-foreground/70 bg-card-hover/20 rounded-2xl border border-dashed border-border/60">
                    <Dumbbell className="w-8 h-8 text-foreground/40" />
                    <p className="text-xs font-bold text-foreground/80">
                      {isAr ? "لا توجد أوزان مسجلة بعد" : "No exercise weights logged yet"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {health.weightLogs.map((wl) => (
                      <div
                        key={wl.exerciseId || wl.exerciseName}
                        className="p-3 bg-card-hover rounded-xl border border-border/60 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{displayExerciseName(wl.exerciseName)}</p>
                          <p className="text-3xs text-foreground/60">{wl.muscleGroup || (isAr ? "تمرين" : "Exercise")}</p>
                        </div>
                        <div className="flex items-center gap-2 text-foreground/80 shrink-0">
                          {wl.latest?.weight != null && (
                            <span className="font-black text-accent">{wl.latest.weight} kg</span>
                          )}
                          {wl.latest?.reps != null && wl.latest?.sets != null && (
                            <span className="text-3xs text-foreground/60">
                              ({wl.latest.sets}×{wl.latest.reps})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </HealthSection>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
