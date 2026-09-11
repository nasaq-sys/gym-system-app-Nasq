"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Calendar,
  Layers,
  Dumbbell,
  Clock,
  Apple,
  Flame,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Portal from "@/components/shared/Portal";

interface ExerciseOption {
  id: string;
  name: string;
  muscleGroup: string;
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

interface TemplateItem {
  id: string;
  day: string;
  exerciseId: string;
  exerciseName: string;
  repsSets: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  items: TemplateItem[];
}

interface MealItem {
  id: string;
  name: string;
  content: string;
}

interface NutritionTemplate {
  id: string;
  name: string;
  goal: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  meals: MealItem[];
}

const FULL_DAY_AR = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const DAY_KEYS = [
  { ar: "اليوم الاول", en: "Day 1", fullAr: "الأحد" },
  { ar: "اليوم الثاني", en: "Day 2", fullAr: "الإثنين" },
  { ar: "اليوم الثالث", en: "Day 3", fullAr: "الثلاثاء" },
  { ar: "اليوم الرابع", en: "Day 4", fullAr: "الأربعاء" },
  { ar: "اليوم الخامس", en: "Day 5", fullAr: "الخميس" },
  { ar: "اليوم السادس", en: "Day 6", fullAr: "الجمعة" },
  { ar: "اليوم السابع", en: "Day 7", fullAr: "السبت" },
];

function displayExerciseName(name: string): string {
  return name.replace(/\s*\([^)؀-ۿ]*\)\s*$/, "").trim() || name;
}

export default function PlanTemplatesPage() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const Back = isAr ? ArrowRight : ArrowLeft;

  // Active Category: Workout Templates vs Nutrition Templates
  const [templateType, setTemplateType] = useState<"workout" | "nutrition">("workout");

  // ── Workout Templates State ──
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);
  const [view, setView] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDays, setFormDays] = useState<Record<string, Record<string, ExerciseSetsReps>>>({});
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const [dayQuery, setDayQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Nutrition Templates State ──
  const [nutritionTemplates, setNutritionTemplates] = useState<NutritionTemplate[]>([]);
  const [nutrLoading, setNutrLoading] = useState(false);
  const [nutrView, setNutrView] = useState<"list" | "form">("list");
  const [nutrEditingId, setNutrEditingId] = useState<string | null>(null);
  const [nutrForm, setNutrForm] = useState({
    name: "",
    goal: "",
    calories: "2000",
    protein: "140",
    carbs: "200",
    fat: "50",
    meals: [
      { id: "m_1", name: "وجبة 1 (إفطار)", content: "4 بيضات مسلوقة + 80غ شوفان مع حليب وتوت" },
      { id: "m_2", name: "وجبة 2 (سناك صباحي)", content: "تفاحة + 30غ لوز نيء أو كاسة لبن يوناني" },
      { id: "m_3", name: "وجبة 3 (غداء)", content: "200غ صدر دجاج مشوي + 150غ أرز بسمتي + سلطة خضراء" },
      { id: "m_4", name: "وجبة 4 (سناك قبل التمرين)", content: "موزة + ملعقة زبدة فول سوداني طبيعية" },
      { id: "m_5", name: "وجبة 5 (عشاء)", content: "علبة تونا مصفاة + 150غ بطاطا حلوة مشوية + أفوكادو" },
    ] as MealItem[],
  });
  const [nutrSaving, setNutrSaving] = useState(false);
  const [nutrDeletingId, setNutrDeletingId] = useState<string | null>(null);

  // ── Fetch Workout Templates ──
  const fetchTemplates = useCallback(() => {
    return fetch("/api/trainer/plan-templates", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((res) => setTemplates(res.data || []))
      .catch(() => {});
  }, []);

  // ── Fetch Nutrition Templates ──
  const fetchNutritionTemplates = useCallback(() => {
    setNutrLoading(true);
    return fetch("/api/trainer/nutrition-templates", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setNutritionTemplates(res.data);
      })
      .finally(() => setNutrLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([
      fetchTemplates(),
      fetchNutritionTemplates(),
      fetch("/api/workouts/exercises", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.success) setExercises(res.data);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchTemplates, fetchNutritionTemplates]);

  // ── Workout Template Form Actions ──
  const openNewForm = () => {
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormDays({});
    setExpandedDay(0);
    setDayQuery("");
    setView("form");
  };

  const openEditForm = (tpl: Template) => {
    setEditingId(tpl.id);
    setFormName(tpl.name);
    setFormDescription(tpl.description || "");
    const days: Record<string, Record<string, ExerciseSetsReps>> = {};
    tpl.items.forEach((it) => {
      if (!days[it.day]) days[it.day] = {};
      days[it.day][it.exerciseId] = parseRepsSets(it.repsSets);
    });
    setFormDays(days);
    setExpandedDay(0);
    setDayQuery("");
    setView("form");
  };

  const toggleExerciseInDay = (dayKey: string, exerciseId: string) => {
    setFormDays((prev) => {
      const next = { ...prev };
      const dayMap = { ...(next[dayKey] || {}) };
      if (exerciseId in dayMap) {
        delete dayMap[exerciseId];
      } else {
        dayMap[exerciseId] = { sets: "3", reps: "10" };
      }
      next[dayKey] = dayMap;
      return next;
    });
  };

  const setExerciseSetsForDay = (dayKey: string, exerciseId: string, val: string) => {
    setFormDays((prev) => {
      const next = { ...prev };
      const dayMap = { ...(next[dayKey] || {}) };
      dayMap[exerciseId] = {
        sets: val,
        reps: dayMap[exerciseId]?.reps ?? "10",
      };
      next[dayKey] = dayMap;
      return next;
    });
  };

  const setExerciseRepsForDay = (dayKey: string, exerciseId: string, val: string) => {
    setFormDays((prev) => {
      const next = { ...prev };
      const dayMap = { ...(next[dayKey] || {}) };
      dayMap[exerciseId] = {
        sets: dayMap[exerciseId]?.sets ?? "3",
        reps: val,
      };
      next[dayKey] = dayMap;
      return next;
    });
  };

  const handleSaveWorkout = async () => {
    if (!formName.trim() || saving) return;
    setSaving(true);

    const items: { day: string; exerciseId: string; repsSets?: string }[] = [];
    Object.entries(formDays).forEach(([dayKey, exMap]) => {
      Object.entries(exMap).forEach(([exerciseId, details]) => {
        const setsStr = (details.sets || "").trim();
        const repsStr = (details.reps || "").trim();
        const repsSets = setsStr && repsStr
          ? `${setsStr}×${repsStr}`
          : setsStr
          ? `${setsStr} جولات`
          : repsStr
          ? `${repsStr} عدات`
          : undefined;
        items.push({ day: dayKey, exerciseId, repsSets });
      });
    });

    try {
      const url = editingId
        ? `/api/trainer/plan-templates/${editingId}`
        : "/api/trainer/plan-templates";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim(),
          items,
        }),
      });

      if (res.ok) {
        await fetchTemplates();
        setView("list");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/trainer/plan-templates/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) await fetchTemplates();
    } finally {
      setDeletingId(null);
    }
  };

  // ── Nutrition Template Form Actions ──
  const openNewNutritionForm = () => {
    setNutrEditingId(null);
    setNutrForm({
      name: "",
      goal: "تنشيف وبناء عضلات",
      calories: "2200",
      protein: "150",
      carbs: "200",
      fat: "55",
      meals: [
        { id: "m_1", name: "وجبة 1 (إفطار)", content: "4 بيضات مسلوقة + 80غ شوفان مع حليب وتوت" },
        { id: "m_2", name: "وجبة 2 (سناك)", content: "تفاحة + 30غ مكسرات نية" },
        { id: "m_3", name: "وجبة 3 (غداء)", content: "200غ صدر دجاج مشوي + 150غ أرز بسمتي + سلطة خضراء" },
        { id: "m_4", name: "وجبة 4 (سناك تمرين)", content: "موزة + سكوب واي بروتين" },
        { id: "m_5", name: "وجبة 5 (عشاء)", content: "علبة تونا + 150غ بطاطا حلوة + سلطة" },
      ],
    });
    setNutrView("form");
  };

  const openEditNutritionForm = (tpl: NutritionTemplate) => {
    setNutrEditingId(tpl.id);
    setNutrForm({
      name: tpl.name,
      goal: tpl.goal,
      calories: String(tpl.calories || 2000),
      protein: String(tpl.protein || 140),
      carbs: String(tpl.carbs || 200),
      fat: String(tpl.fat || 50),
      meals: tpl.meals && tpl.meals.length > 0 ? tpl.meals : [
        { id: "m_1", name: "وجبة الإفطار", content: tpl.breakfast || "" },
        { id: "m_2", name: "وجبة الغداء", content: tpl.lunch || "" },
        { id: "m_3", name: "وجبة العشاء", content: tpl.dinner || "" },
      ],
    });
    setNutrView("form");
  };

  const handleAddMeal = () => {
    setNutrForm((prev) => {
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
    setNutrForm((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== mealId),
    }));
  };

  const handleUpdateMeal = (mealId: string, key: "name" | "content", val: string) => {
    setNutrForm((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => (m.id === mealId ? { ...m, [key]: val } : m)),
    }));
  };

  const handleSaveNutrition = async () => {
    if (!nutrForm.name.trim() || nutrSaving) return;
    setNutrSaving(true);
    try {
      const url = nutrEditingId
        ? `/api/trainer/nutrition-templates/${nutrEditingId}`
        : "/api/trainer/nutrition-templates";
      const method = nutrEditingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: nutrForm.name.trim(),
          goal: nutrForm.goal.trim(),
          calories: Number(nutrForm.calories) || 0,
          protein: Number(nutrForm.protein) || 0,
          carbs: Number(nutrForm.carbs) || 0,
          fat: Number(nutrForm.fat) || 0,
          meals: nutrForm.meals,
        }),
      });

      if (res.ok) {
        await fetchNutritionTemplates();
        setNutrView("list");
      }
    } finally {
      setNutrSaving(false);
    }
  };

  const handleDeleteNutrition = async (id: string) => {
    if (nutrDeletingId) return;
    setNutrDeletingId(id);
    try {
      const res = await fetch(`/api/trainer/nutrition-templates/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) await fetchNutritionTemplates();
    } finally {
      setNutrDeletingId(null);
    }
  };

  const pickerExercises = exercises.filter((e) =>
    e.name.toLowerCase().includes(dayQuery.trim().toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in pb-16">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">
            {isAr ? "مكتبة القوالب والخطط الجاهزة" : "Templates & Pre-Made Plans"}
          </h1>
          <p className="text-xs text-foreground/70 mt-0.5">
            {isAr
              ? "إنشاء وإدارة قوالب التمارين والأنظمة الغذائية لتطبيقها على المتدربين بنقرة واحدة"
              : "Create workout & nutrition templates to apply to trainees instantly"}
          </p>
        </div>

        {/* Create Button depending on tab */}
        {templateType === "workout" && view === "list" && (
          <button
            onClick={openNewForm}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? "قالب تمارين جديد" : "New Workout Template"}</span>
          </button>
        )}

        {templateType === "nutrition" && nutrView === "list" && (
          <button
            onClick={openNewNutritionForm}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? "قالب تغذية جديد" : "New Nutrition Template"}</span>
          </button>
        )}
      </div>

      {/* ── 2 Main Segmented Tabs ── */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-card/80 backdrop-blur-md rounded-2xl border border-border/80">
        <button
          onClick={() => setTemplateType("workout")}
          className={cn(
            "flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
            templateType === "workout"
              ? "bg-accent text-accent-foreground shadow-md"
              : "text-foreground/70 hover:text-foreground hover:bg-card-hover"
          )}
        >
          <Dumbbell className="w-4 h-4" />
          <span>{isAr ? "قوالب الجداول التدريبية" : "Workout Templates"}</span>
          <span className="text-3xs px-2 py-0.5 rounded-full bg-background/50 border border-border/60">
            {templates.length}
          </span>
        </button>

        <button
          onClick={() => setTemplateType("nutrition")}
          className={cn(
            "flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer",
            templateType === "nutrition"
              ? "bg-accent text-accent-foreground shadow-md"
              : "text-foreground/70 hover:text-foreground hover:bg-card-hover"
          )}
        >
          <Apple className="w-4 h-4" />
          <span>{isAr ? "قوالب الخطط الغذائية" : "Nutrition Templates"}</span>
          <span className="text-3xs px-2 py-0.5 rounded-full bg-background/50 border border-border/60">
            {nutritionTemplates.length}
          </span>
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════
          SECTION 1: 🏋️‍♂️ WORKOUT PLAN TEMPLATES
         ═════════════════════════════════════════════════════════════════════════ */}
      {templateType === "workout" && (
        view === "list" ? (
          loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-accent flex items-center justify-center mx-auto">
                <Dumbbell className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {isAr ? "لا توجد قوالب تمارين بعد" : "No workout templates yet"}
              </p>
              <p className="text-xs text-foreground/70 max-w-sm mx-auto">
                {isAr
                  ? "أنشئ قالباً تدريبياً جاهزاً (مثل Push-Pull-Legs) لتطبيقه على أي متدرب بنقرة واحدة."
                  : "Create pre-made workout splits to assign directly to trainees."}
              </p>
              <button
                onClick={openNewForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isAr ? "إنشاء أول قالب تمارين" : "Create Workout Template"}</span>
              </button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => {
                const dayCount = new Set(template.items.map((it) => it.day)).size;
                return (
                  <Card key={template.id} className="p-5 space-y-4 border border-border/80 hover:border-primary/40 transition-all flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-black text-foreground">
                          {template.name}
                        </h3>
                        <span className="text-2xs font-bold px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground border border-primary/30 shrink-0">
                          {isAr ? `${dayCount} أيام تدريب` : `${dayCount} days`}
                        </span>
                      </div>
                      {template.description && (
                        <p className="text-xs text-foreground/70 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                      <p className="text-2xs text-foreground/70 font-semibold">
                        {isAr ? `${template.items.length} تمرين إجمالي` : `${template.items.length} total exercises`}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                      <button
                        onClick={() => openEditForm(template)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-card-hover border border-border text-foreground hover:border-primary/40 transition-all cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{isAr ? "تعديل" : "Edit"}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteWorkout(template.id)}
                        disabled={deletingId === template.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isAr ? "حذف" : "Delete"}</span>
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* Workout Drawer Form */
          <Portal>
            <div className="fixed inset-0 z-[100] flex justify-end animate-fade-in">
              <div
                onClick={() => setView("list")}
                className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity cursor-pointer"
              />
              <div
                className="relative z-10 flex max-w-full w-full sm:max-w-xl bg-card border-s border-border shadow-2xl flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
              >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/70 bg-card shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-black text-foreground truncate">
                        {editingId ? (isAr ? "تعديل قالب التمارين" : "Edit Workout Template") : (isAr ? "إنشاء قالب تمارين جديد" : "New Workout Template")}
                      </h2>
                      <p className="text-2xs text-foreground/70 truncate">
                        {isAr ? "تحديد التمارين والجلسات لكل يوم" : "Configure exercises & days"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                    aria-label={isAr ? "إغلاق" : "Close"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-foreground/70 block mb-1">
                    {isAr ? "اسم القالب" : "Template Name"}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={isAr ? "مثال: Push Pull Legs - 3 Days" : "e.g. 4-Day Upper/Lower"}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground/70 block mb-1">
                    {isAr ? "الوصف" : "Description"}
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={isAr ? "وصف مختصر لتقسيمة التمرين..." : "Brief description..."}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Days Accordion */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-black text-foreground block">
                    {isAr ? "تقسيمة أيام التدريب والتمارين:" : "Training Days & Exercises:"}
                  </label>

                  {DAY_KEYS.map((day, idx) => {
                    const isExpanded = expandedDay === idx;
                    const dayMap = formDays[day.ar] || {};
                    const exCount = Object.keys(dayMap).length;

                    return (
                      <div key={idx} className="border border-border/80 rounded-2xl overflow-hidden bg-background">
                        <button
                          type="button"
                          onClick={() => setExpandedDay(isExpanded ? null : idx)}
                          className="w-full flex items-center justify-between p-3.5 text-start cursor-pointer hover:bg-card-hover/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {isAr ? `${day.fullAr} (${day.ar})` : day.en}
                            </span>
                            <span className="text-3xs px-2 py-0.5 rounded-full bg-card-hover text-foreground/70 font-bold">
                              {isAr ? `${exCount} تمارين` : `${exCount} exercises`}
                            </span>
                          </div>
                          <ChevronDown className={cn("w-4 h-4 text-foreground/70 transition-transform", isExpanded && "rotate-180")} />
                        </button>

                        {isExpanded && (
                          <div className="p-3 border-t border-border/60 space-y-3 bg-card/40">
                            {/* Selected exercises */}
                            {Object.keys(dayMap).length > 0 && (
                              <div className="flex items-center justify-between px-1 text-3xs font-bold text-accent">
                                <span>{isAr ? "التمارين المختارة:" : "Selected Exercises:"}</span>
                                <div className="flex items-center gap-1.5 pe-8">
                                  <span className="w-12 sm:w-14 text-center">{isAr ? "الجولات" : "Sets"}</span>
                                  <span className="w-2 text-center text-transparent">×</span>
                                  <span className="w-12 sm:w-14 text-center">{isAr ? "العدات" : "Reps"}</span>
                                </div>
                              </div>
                            )}
                            {Object.entries(dayMap).map(([exerciseId, details]) => {
                              const exercise = exercises.find((e) => e.id === exerciseId);
                              return (
                                <div key={exerciseId} className="flex items-center gap-2 bg-card border border-border rounded-xl p-2.5">
                                  <span className="text-xs font-bold text-foreground flex-1 min-w-0 truncate">
                                    {exercise ? displayExerciseName(exercise.name) : exerciseId}
                                  </span>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <input
                                      type="number"
                                      min={1}
                                      value={details.sets}
                                      onChange={(e) => setExerciseSetsForDay(day.ar, exerciseId, e.target.value)}
                                      placeholder="3"
                                      title={isAr ? "عدد الجولات" : "Sets"}
                                      className="w-12 sm:w-14 bg-background border border-border rounded-lg px-1.5 py-1 text-xs font-bold text-center text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent"
                                    />
                                    <span className="text-xs font-bold text-foreground/50 select-none">×</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={details.reps}
                                      onChange={(e) => setExerciseRepsForDay(day.ar, exerciseId, e.target.value)}
                                      placeholder="10"
                                      title={isAr ? "عدد التكرارات" : "Reps"}
                                      className="w-12 sm:w-14 bg-background border border-border rounded-lg px-1.5 py-1 text-xs font-bold text-center text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleExerciseInDay(day.ar, exerciseId)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-destructive shrink-0 cursor-pointer"
                                    title={isAr ? "إزالة التمرين" : "Remove"}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}

                            {/* Add exercise search */}
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-foreground/70" />
                              <input
                                type="text"
                                value={dayQuery}
                                onChange={(e) => setDayQuery(e.target.value)}
                                placeholder={isAr ? "بحث عن تمرين لإضافته لهذا اليوم..." : "Search exercise to add..."}
                                className="w-full bg-card border border-border rounded-xl ps-8 pe-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div className="max-h-36 overflow-y-auto space-y-1">
                              {exercises
                                .filter((ex) =>
                                  dayQuery.trim() === "" ||
                                  ex.name.toLowerCase().includes(dayQuery.toLowerCase()) ||
                                  (ex.muscleGroup && ex.muscleGroup.toLowerCase().includes(dayQuery.toLowerCase()))
                                )
                                .slice(0, 20)
                                .map((ex) => {
                                  const isSelected = ex.id in dayMap;
                                  return (
                                    <button
                                      key={ex.id}
                                      type="button"
                                      onClick={() => toggleExerciseInDay(day.ar, ex.id)}
                                      className={cn(
                                        "w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold text-start transition-all cursor-pointer",
                                        isSelected
                                          ? "bg-primary text-primary-foreground border border-primary/40"
                                          : "bg-card border border-border/60 text-foreground/70 hover:text-foreground"
                                      )}
                                    >
                                      <span className="truncate">{displayExerciseName(ex.name)}</span>
                                      <span className="text-3xs text-foreground/70">{ex.muscleGroup}</span>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 sm:p-5 border-t border-border/70 bg-card flex items-center gap-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={handleSaveWorkout}
                  disabled={saving || !formName.trim()}
                  className="flex-1 py-3 rounded-2xl text-xs font-black bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ القالب" : "Save Template"}
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="px-5 py-3 rounded-2xl text-xs font-bold bg-card-hover border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer min-h-[44px]"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
        )
      )}

      {/* ═════════════════════════════════════════════════════════════════════════
          SECTION 2: 🥗 NUTRITION PLAN TEMPLATES (Flexible 1 to 6+ Meals)
         ═════════════════════════════════════════════════════════════════════════ */}
      {templateType === "nutrition" && (
        nutrView === "list" ? (
          nutrLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : nutritionTemplates.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-accent flex items-center justify-center mx-auto">
                <Utensils className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {isAr ? "لا توجد قوالب خطط غذائية بعد" : "No nutrition templates yet"}
              </p>
              <p className="text-xs text-foreground/70 max-w-sm mx-auto">
                {isAr
                  ? "أنشئ قوالب جاهزة (تنشيف 1800 سعرة، تضخيم 3000 سعرة، كيتو، دايت 5 وجبات) لتطبيقها على أي متدرب بنقرة واحدة."
                  : "Create pre-made meal plans with custom macros and dynamic meals."}
              </p>
              <button
                onClick={openNewNutritionForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-accent text-accent-foreground hover:brightness-110 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isAr ? "إنشاء أول قالب غذائي" : "Create Nutrition Template"}</span>
              </button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nutritionTemplates.map((template) => {
                const mealCount = template.meals?.length || 3;
                return (
                  <Card key={template.id} className="p-5 space-y-4 border border-border/80 hover:border-primary/40 transition-all flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-black text-foreground">
                            {template.name}
                          </h3>
                          {template.goal && (
                            <span className="inline-block text-2xs font-bold text-accent mt-0.5">
                              {template.goal}
                            </span>
                          )}
                        </div>
                        <span className="text-2xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                          {isAr ? `${mealCount} وجبات / سناكات` : `${mealCount} meals`}
                        </span>
                      </div>

                      {/* Macros Bar */}
                      <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-xl bg-background/80 border border-border/60 text-center">
                        <div>
                          <p className="text-3xs text-foreground/70 font-bold">{isAr ? "السعرات" : "Kcal"}</p>
                          <p className="text-xs font-black text-foreground mt-0.5">{template.calories || 0}</p>
                        </div>
                        <div>
                          <p className="text-3xs text-foreground/70 font-bold">{isAr ? "بروتين" : "Prot"}</p>
                          <p className="text-xs font-black text-foreground mt-0.5">{template.protein || 0}g</p>
                        </div>
                        <div>
                          <p className="text-3xs text-foreground/70 font-bold">{isAr ? "كارب" : "Carb"}</p>
                          <p className="text-xs font-black text-foreground mt-0.5">{template.carbs || 0}g</p>
                        </div>
                        <div>
                          <p className="text-3xs text-foreground/70 font-bold">{isAr ? "دهون" : "Fat"}</p>
                          <p className="text-xs font-black text-foreground mt-0.5">{template.fat || 0}g</p>
                        </div>
                      </div>

                      {/* Meal preview pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(template.meals || []).map((m, i) => (
                          <span key={i} className="text-3xs px-2 py-0.5 rounded-lg bg-card-hover border border-border/50 text-foreground/80 font-medium">
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                      <button
                        onClick={() => openEditNutritionForm(template)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-card-hover border border-border text-foreground hover:border-primary/40 transition-all cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{isAr ? "تعديل" : "Edit"}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteNutrition(template.id)}
                        disabled={nutrDeletingId === template.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isAr ? "حذف" : "Delete"}</span>
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* Nutrition Template Drawer Form (Flexible Meals / Snacks) */
          <Portal>
            <div className="fixed inset-0 z-[100] flex justify-end animate-fade-in">
              <div
                onClick={() => setNutrView("list")}
                className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity cursor-pointer"
              />
              <div
                className="relative z-10 flex max-w-full w-full sm:max-w-xl bg-card border-s border-border shadow-2xl flex-col h-[100dvh] max-h-[100dvh] overflow-hidden"
              >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/70 bg-card shrink-0 pt-[max(1rem,env(safe-area-inset-top))]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 text-accent flex items-center justify-center shrink-0">
                      <Apple className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-black text-foreground truncate">
                        {nutrEditingId ? (isAr ? "تعديل قالب الخطة الغذائية" : "Edit Nutrition Template") : (isAr ? "إنشاء قالب خطة غذائية جديدة" : "New Nutrition Template")}
                      </h2>
                      <p className="text-2xs text-foreground/70 truncate">
                        {isAr ? "إعداد السعرات والماكروز وتوزيع الوجبات" : "Configure calories, macros & custom meals"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNutrView("list")}
                    className="w-9 h-9 rounded-full bg-card-hover flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                    aria-label={isAr ? "إغلاق" : "Close"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {/* Template Name & Goal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "اسم القالب" : "Template Name"}
                    </label>
                    <input
                      type="text"
                      value={nutrForm.name}
                      onChange={(e) => setNutrForm({ ...nutrForm, name: e.target.value })}
                      placeholder={isAr ? "مثال: تنشيف قاسي 1800 سعرة (5 وجبات)" : "e.g. 2500 kcal Cutting Plan"}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "الهدف الغذائي" : "Goal"}
                    </label>
                    <input
                      type="text"
                      value={nutrForm.goal}
                      onChange={(e) => setNutrForm({ ...nutrForm, goal: e.target.value })}
                      placeholder={isAr ? "تضخيم صافي، تنشيف، كيتو، تحسين لياقة..." : "Bulking, Cutting, Keto..."}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Calories & Macros */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "السعرات (kcal)" : "Calories"}
                    </label>
                    <input
                      type="number"
                      value={nutrForm.calories}
                      onChange={(e) => setNutrForm({ ...nutrForm, calories: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "البروتين (g)" : "Protein (g)"}
                    </label>
                    <input
                      type="number"
                      value={nutrForm.protein}
                      onChange={(e) => setNutrForm({ ...nutrForm, protein: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "الكارب (g)" : "Carbs (g)"}
                    </label>
                    <input
                      type="number"
                      value={nutrForm.carbs}
                      onChange={(e) => setNutrForm({ ...nutrForm, carbs: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground/70 block mb-1">
                      {isAr ? "الدهون (g)" : "Fat (g)"}
                    </label>
                    <input
                      type="number"
                      value={nutrForm.fat}
                      onChange={(e) => setNutrForm({ ...nutrForm, fat: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Dynamic Flexible Meals & Snacks */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <label className="text-xs font-black text-foreground">
                        {isAr ? "تفاصيل الوجبات والسناكات اليومية (مرن بالكامل):" : "Daily Meals & Snacks:"}
                      </label>
                      <p className="text-2xs text-foreground/70">
                        {isAr ? "يمكنك إضافة أي عدد من الوجبات والسناكات وتسميتها بحرية" : "Add custom meals and snacks"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddMeal}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground border border-primary/30 hover:bg-primary/90 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAr ? "إضافة وجبة / سناك" : "Add Meal / Snack"}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {nutrForm.meals.map((meal, idx) => (
                      <div key={meal.id || idx} className="p-3.5 bg-background border border-border/80 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={meal.name}
                            onChange={(e) => handleUpdateMeal(meal.id, "name", e.target.value)}
                            placeholder={`وجبة ${idx + 1}`}
                            className="bg-card border border-border/60 rounded-lg px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none focus:border-accent w-48"
                          />

                          {nutrForm.meals.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMeal(meal.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              title={isAr ? "حذف هذه الوجبة" : "Remove meal"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <textarea
                          rows={2}
                          value={meal.content}
                          onChange={(e) => handleUpdateMeal(meal.id, "content", e.target.value)}
                          placeholder={isAr ? "تفاصيل الوجبة والمكونات والكميات..." : "Meal ingredients and portions..."}
                          className="w-full bg-card border border-border/60 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-accent"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 sm:p-5 border-t border-border/70 bg-card flex items-center gap-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={handleSaveNutrition}
                  disabled={nutrSaving || !nutrForm.name.trim()}
                  className="flex-1 py-3 rounded-2xl text-xs font-black bg-accent text-accent-foreground hover:brightness-110 transition-all cursor-pointer shadow-md disabled:opacity-50 min-h-[44px]"
                >
                  {nutrSaving ? (isAr ? "جاري الحفظ..." : "Saving...") : isAr ? "حفظ القالب الغذائي" : "Save Nutrition Template"}
                </button>
                <button
                  type="button"
                  onClick={() => setNutrView("list")}
                  className="px-5 py-3 rounded-2xl text-xs font-bold bg-card-hover border border-border text-foreground/70 hover:text-foreground transition-all cursor-pointer min-h-[44px]"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
        )
      )}
    </div>
  );
}
