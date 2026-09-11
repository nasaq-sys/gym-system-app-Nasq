"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import FoodSearchSheet from "@/components/shared/FoodSearchSheet";
import {
  Plus,
  Trash2,
  UtensilsCrossed,
  Flame,
  Beef,
  Wheat,
  Droplets,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Food {
  id: string;
  name?: string;
  calories100g: number;
  protein100g: number;
  fat100g: number;
  carbs100g: number;
}

interface MealEntry {
  id: string;
  name: string;
  quantityG: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const MACRO_TILES = [
  {
    key: "calories",
    icon: Flame,
    iconCls: "text-orange-500",
    tileCls: "bg-orange-500/10",
  },
  {
    key: "protein",
    icon: Beef,
    iconCls: "text-blue-500",
    tileCls: "bg-blue-500/10",
  },
  {
    key: "carbs",
    icon: Wheat,
    iconCls: "text-amber-500",
    tileCls: "bg-amber-500/10",
  },
  {
    key: "fat",
    icon: Droplets,
    iconCls: "text-purple-500",
    tileCls: "bg-purple-500/10",
  },
] as const;

export default function MealCalculator() {
  const { t } = useI18n();
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(true);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const savedQuantities = useRef<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/meal-calculator", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) setFoods(data.data);
      })
      .catch(() => {})
      .finally(() => setLoadingFoods(false));

    fetch("/api/meal-log", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((res) => {
        const entries: MealEntry[] = res?.data?.entries || [];
        setMeals(entries);
        savedQuantities.current = Object.fromEntries(
          entries.map((m) => [m.id, m.quantityG])
        );
      })
      .catch(() => {})
      .finally(() => setLoadingMeals(false));
  }, []);

  const totals = useMemo(() => {
    return meals.reduce(
      (acc, m) => {
        acc.calories += m.calories;
        acc.protein += m.protein;
        acc.carbs += m.carbs;
        acc.fat += m.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [meals]);

  const addFood = async (food: Food, quantityG: number) => {
    try {
      const res = await fetch("/api/meal-log", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: food.id, name: food.name, quantityG }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        const entry: MealEntry = json.data;
        savedQuantities.current[entry.id] = entry.quantityG;
        setMeals((prev) => [...prev, entry]);
      }
    } catch {
      // network hiccup
    }
  };

  const removeMeal = async (id: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    delete savedQuantities.current[id];
    try {
      await fetch(`/api/meal-log/${id}`, { method: "DELETE", credentials: "same-origin" });
    } catch {
      // ignore
    }
  };

  const editMealQuantity = (id: string, quantityG: number) => {
    const qty = Math.max(1, Math.min(5000, quantityG || 1));
    setMeals((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              quantityG: qty,
              calories: (m.calories / m.quantityG) * qty || 0,
              protein: (m.protein / m.quantityG) * qty || 0,
              carbs: (m.carbs / m.quantityG) * qty || 0,
              fat: (m.fat / m.quantityG) * qty || 0,
            }
          : m
      )
    );
  };

  const commitMealQuantity = async (id: string) => {
    const meal = meals.find((m) => m.id === id);
    if (!meal || savedQuantities.current[id] === meal.quantityG) return;
    try {
      const res = await fetch(`/api/meal-log/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityG: meal.quantityG }),
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        savedQuantities.current[id] = json.data.quantityG;
        setMeals((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...json.data } : m))
        );
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* 2x2 macro tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {MACRO_TILES.map(({ key, icon: Icon, iconCls, tileCls }) => (
          <Card
            key={key}
            className="flex items-center gap-3 p-4 flex-row"
          >
            <div
              className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                tileCls
              )}
            >
              <Icon className={cn("w-5 h-5", iconCls)} />
            </div>
            <div className="min-w-0">
              <p className="text-2xs text-foreground/70 font-semibold">
                {t(`mealCalculator.${key}`)}
              </p>
              <p className="text-base font-bold text-foreground truncate">
                {key === "calories"
                  ? `${Math.round(totals.calories)} kcal`
                  : `${round1(totals[key])} ${t("mealCalculator.grams")}`}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Today's meals */}
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-bold">
            {t("mealCalculator.todayMeals")}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setSheetOpen(true)}
            className="gap-1.5 h-8 text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("mealCalculator.addMeal")}</span>
          </Button>
        </CardHeader>

        <CardContent>
          {loadingMeals ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : meals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <UtensilsCrossed className="w-10 h-10 text-foreground/70" />
              <p className="text-foreground/70 text-sm text-center">
                {t("mealCalculator.emptyMeals")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {meals.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl bg-muted/40 border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-foreground leading-snug break-words min-w-0">
                      {m.name}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMeal(m.id)}
                      className="w-7 h-7 text-foreground/70 hover:text-destructive"
                      title={t("mealCalculator.remove")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={5000}
                        value={m.quantityG}
                        onChange={(e) => editMealQuantity(m.id, Number(e.target.value))}
                        onBlur={() => commitMealQuantity(m.id)}
                        title={t("mealCalculator.quantity")}
                        className="w-16 h-7 text-2xs text-center"
                      />
                      <span className="text-2xs text-foreground/70">
                        {t("mealCalculator.grams")}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-primary shrink-0">
                      {Math.round(m.calories)} kcal
                    </p>
                  </div>
                  <div className="flex gap-3 mt-2 text-2xs text-foreground/70 font-medium">
                    <span>P: {round1(m.protein)}g</span>
                    <span>C: {round1(m.carbs)}g</span>
                    <span>F: {round1(m.fat)}g</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FoodSearchSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        foods={foods}
        loading={loadingFoods}
        onAdd={addFood}
      />
    </div>
  );
}
