"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import MealCalculator from "@/components/shared/MealCalculator";
import {
  Flame,
  Beef,
  Wheat,
  Droplets,
  UtensilsCrossed,
  Sun,
  SunMedium,
  Moon,
  Calculator,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";

interface MealItem {
  id: string;
  name: string;
  content: string;
}

interface PlanLike {
  id: string;
  number?: unknown;
  calories?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  goal?: unknown;
  breakfast?: unknown;
  lunch?: unknown;
  dinner?: unknown;
  meals?: MealItem[];
}

interface NutritionData {
  myPlan: PlanLike | null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtMacro(v: unknown): string {
  const n = toNum(v);
  return n == null ? "---" : `${Math.round(n * 10) / 10} g`;
}

export default function NutritionPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [data, setData] = useState<NutritionData | null>(() => getClientCachedData<NutritionData>("/api/nutrition"));
  const [loading, setLoading] = useState(() => !getClientCachedData("/api/nutrition"));
  const [tab, setTab] = useState<string>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "calculator"
      ? "calculator"
      : "plan"
  );

  useEffect(() => {
    clientFetch<NutritionData>("/api/nutrition", undefined, { ttlMs: 60000 })
      .then((res) => {
        if (res) setData(res);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const plan = data?.myPlan || null;
  const planKcal = toNum(plan?.calories);
  const kcal = planKcal != null ? `${Math.round(planKcal)} kcal` : "---";
  const planTitle =
    plan?.number != null && plan.number !== ""
      ? t("nutrition.planNumber", { n: fmt(plan.number) })
      : t("nutrition.title");

  return (
    <div className="space-y-6 pb-12">
      {/* Desktop Hero Banner */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary text-primary-foreground font-bold">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{isAr ? "الخطة الغذائية المتوازنة" : "Nutrition & Macros Plan"}</span>
            </Badge>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("nutrition.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "متابعة السعرات والماكروز اليومية (بروتين، كاربوهيدرات، دهون) وجدول الوجبات الغذائية."
                : "Monitor daily calories, macros balance, and scheduled healthy meals."}
            </p>
          </div>
          {planKcal != null && (
            <div className="flex flex-col items-center justify-center p-3 px-5 rounded-2xl bg-primary/10 border border-primary/20 shrink-0">
              <span className="text-2xl font-black text-primary tabular-nums leading-none">
                {Math.round(planKcal)}
              </span>
              <span className="text-3xs font-bold text-foreground mt-1">
                {isAr ? "سعرة يومياً" : "Daily Kcal"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="block lg:hidden">
        <h1 className="text-2xl font-bold text-foreground">{t("nutrition.title")}</h1>
        <p className="text-sm text-foreground/70 mt-1">{t("nutrition.subtitle")}</p>
      </div>

      {/* Plan / Calculator Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="plan" className="gap-2 font-bold text-sm">
            <ClipboardList className="w-4 h-4" />
            <span>{t("nutrition.tabPlan")}</span>
          </TabsTrigger>
          <TabsTrigger value="calculator" className="gap-2 font-bold text-sm">
            <Calculator className="w-4 h-4" />
            <span>{t("nutrition.tabCalculator")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculator" className="mt-6">
          <MealCalculator />
        </TabsContent>

        <TabsContent value="plan" className="mt-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : !plan ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <UtensilsCrossed className="w-8 h-8 text-primary" />
                </div>
                <p className="text-foreground/70 text-center max-w-sm">{t("nutrition.noPlan")}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Plan header */}
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {planTitle}
                    </h2>
                    {plan.goal != null && plan.goal !== "" && (
                      <p className="text-sm text-foreground/70 mt-1">
                        {t("nutrition.goal")}:{" "}
                        <span className="font-semibold text-foreground">{fmt(plan.goal)}</span>
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-sm font-bold px-3 py-1">
                    {kcal}
                  </Badge>
                </CardContent>
              </Card>

              {/* Macros */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="flex items-center gap-3 p-4 flex-row">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Flame className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs text-foreground/70 font-semibold">{t("nutrition.calories")}</p>
                    <p className="text-base font-bold text-foreground truncate">{kcal}</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 p-4 flex-row">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Beef className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs text-foreground/70 font-semibold">{t("nutrition.protein")}</p>
                    <p className="text-base font-bold text-foreground truncate">{fmtMacro(plan.protein)}</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 p-4 flex-row">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Wheat className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs text-foreground/70 font-semibold">{t("nutrition.carbs")}</p>
                    <p className="text-base font-bold text-foreground truncate">{fmtMacro(plan.carbs)}</p>
                  </div>
                </Card>
                <Card className="flex items-center gap-3 p-4 flex-row">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Droplets className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xs text-foreground/70 font-semibold">{t("nutrition.fat")}</p>
                    <p className="text-base font-bold text-foreground truncate">{fmtMacro(plan.fat)}</p>
                  </div>
                </Card>
              </div>

              {/* Meals */}
              <Card>
                <CardHeader>
                  <CardTitle>{isAr ? "جدول الوجبات والسناكات اليومية" : "Daily Meals & Snacks Schedule"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border/60">
                    {(plan.meals && plan.meals.length > 0
                      ? plan.meals
                      : [
                          { id: "m_1", name: t("nutrition.breakfast"), content: String(plan.breakfast || "") },
                          { id: "m_2", name: t("nutrition.lunch"), content: String(plan.lunch || "") },
                          { id: "m_3", name: t("nutrition.dinner"), content: String(plan.dinner || "") },
                        ]
                    ).map((meal, idx) => {
                      const isBreakfast = idx === 0 || meal.name.includes("فطور") || meal.name.includes("إفطار");
                      const isLunch = idx === 2 || meal.name.includes("غداء");
                      const isDinner = meal.name.includes("عشاء");
                      const icon = isBreakfast ? (
                        <Sun className="w-4 h-4 text-amber-500" />
                      ) : isLunch ? (
                        <SunMedium className="w-4 h-4 text-red-500" />
                      ) : isDinner ? (
                        <Moon className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Flame className="w-4 h-4 text-emerald-500" />
                      );

                      return (
                        <div key={meal.id || idx} className="flex items-start gap-3 px-1 py-3.5">
                          <div className="shrink-0 w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center">
                            {icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground/70">{meal.name}</p>
                            <p className="text-sm text-foreground leading-relaxed mt-0.5 whitespace-pre-line">
                              {fmt(meal.content)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
