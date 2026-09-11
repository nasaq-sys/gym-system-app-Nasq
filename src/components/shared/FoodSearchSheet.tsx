"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Search, Plus, Loader2, UtensilsCrossed, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Food } from "@/components/shared/MealCalculator";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

export default function FoodSearchSheet({
  open,
  onClose,
  foods,
  loading,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  foods: Food[];
  loading: boolean;
  onAdd: (food: Food, quantityG: number) => void;
}) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // On phones the sheet should rise from the bottom (like the cart sheet);
  // on larger screens it stays a side panel. Tracks Tailwind's `md` (768px)
  // breakpoint, same cutoff used app-wide for the mobile/desktop split.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handleChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter((f) => String(f.name || "").toLowerCase().includes(q));
  }, [foods, query]);

  const handleAdd = (food: Food) => {
    const qty = quantities[food.id] || 100;
    onAdd(food, qty);
    setAddedIds((prev) => new Set(prev).add(food.id));
    window.setTimeout(() => {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(food.id);
        return next;
      });
    }, 1200);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      swipeDirection={isMobile ? "down" : "right"}
    >
      <DrawerContent
        className={cn(
          "flex flex-col p-0 bg-card text-foreground",
          isMobile
            ? "max-h-[85vh]"
            : "max-w-lg h-full inset-y-0 rounded-none border-y-0"
        )}
      >
        {/* Header */}
        <DrawerHeader className="flex flex-row items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <DrawerTitle className="text-base sm:text-lg font-bold text-foreground">
                {t("mealCalculator.addMeal")}
              </DrawerTitle>
              <p className="text-xs text-foreground/70 mt-0.5">
                {isAr ? "ابحث عن صنف طعام وأضف الكمية بالجرام" : "Search foods and specify grams"}
              </p>
            </div>
          </div>
          <DrawerClose
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "w-8 h-8 rounded-full text-foreground/70 hover:text-foreground cursor-pointer")}
            aria-label={t("mealCalculator.close")}
          >
            <X className="w-4 h-4" />
          </DrawerClose>
        </DrawerHeader>

        {/* Search Box */}
        <div className="p-4 sm:px-5 pb-2 shrink-0 bg-card">
          <div className="relative">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/70" />
            <Input
              className="ps-10"
              placeholder={t("mealCalculator.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Scrollable Food List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center text-foreground/70">
                <UtensilsCrossed className="w-7 h-7" />
              </div>
              <p className="text-foreground/70 text-sm font-bold">
                {query ? t("mealCalculator.noResults") : t("mealCalculator.noFoods")}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-6">
              {filtered.map((food) => {
                const added = addedIds.has(food.id);
                return (
                  <div
                    key={food.id}
                    className="rounded-2xl bg-muted/30 border border-border/80 p-3.5 space-y-3 hover:border-primary/40 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-foreground leading-snug">
                          {food.name}
                        </p>
                        <div className="flex items-center gap-2 text-2xs text-foreground/70 font-bold mt-1" dir="ltr">
                          <span className="text-primary">{food.calories100g} kcal</span>
                          <span>·</span>
                          <span>P {food.protein100g}g</span>
                          <span>·</span>
                          <span>C {food.carbs100g}g</span>
                          <span>·</span>
                          <span>F {food.fat100g}g</span>
                          <span className="text-3xs text-foreground/70">/100g</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={5000}
                          className="w-20 text-center font-bold h-8 text-xs"
                          value={quantities[food.id] || 100}
                          onChange={(e) =>
                            setQuantities((q) => ({
                              ...q,
                              [food.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          title={t("mealCalculator.quantity")}
                        />
                        <span className="text-2xs font-bold text-foreground/70">
                          {t("mealCalculator.grams")}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleAdd(food)}
                        variant={added ? "secondary" : "default"}
                        className="gap-1.5"
                      >
                        {added ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>{added ? (isAr ? "تمت الإضافة ✓" : "Added ✓") : (isAr ? "إضافة" : t("mealCalculator.add"))}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
