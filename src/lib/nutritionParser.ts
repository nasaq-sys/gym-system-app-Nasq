export interface MealEntry {
  id: string;
  name: string;
  content: string;
  key?: string;
}

export const STANDARD_MEAL_KEYS = [
  { key: "meal1", labelAr: "وجبة 1 (إفطار)", labelEn: "Meal 1 (Breakfast)", fieldKey: "وجبة 1 (إفطار)", fallback: "وجبة الإفطار" },
  { key: "snack1", labelAr: "سناك 1 (صباحي)", labelEn: "Snack 1 (Morning)", fieldKey: "سناك 1 (صباحي)" },
  { key: "meal2", labelAr: "وجبة 2 (غداء)", labelEn: "Meal 2 (Lunch)", fieldKey: "وجبة 2 (غداء)", fallback: "وجبة الغداء" },
  { key: "snack2", labelAr: "سناك 2 (قبل/بعد التمرين)", labelEn: "Snack 2 (Workout)", fieldKey: "سناك 2 (قبل/بعد التمرين)" },
  { key: "meal3", labelAr: "وجبة 3 (عشاء)", labelEn: "Meal 3 (Dinner)", fieldKey: "وجبة 3 (عشاء)", fallback: "وجبة العشاء" },
  { key: "snack3", labelAr: "سناك 3 (قبل النوم)", labelEn: "Snack 3 (Night)", fieldKey: "سناك 3 (قبل النوم)" },
] as const;

export function extractMealsFromFields(fields: Record<string, unknown>): MealEntry[] {
  const meals: MealEntry[] = [];

  // Check the 6 discrete columns first
  STANDARD_MEAL_KEYS.forEach((cfg, idx) => {
    let content = (fields[cfg.fieldKey] as string | undefined)?.trim();
    if (!content && "fallback" in cfg && cfg.fallback) {
      content = (fields[cfg.fallback] as string | undefined)?.trim();
    }
    if (content) {
      meals.push({
        id: `m_${idx + 1}`,
        name: cfg.labelAr,
        content,
        key: cfg.key,
      });
    }
  });

  // If no discrete meal columns had content, try parsing JSON from "تفاصيل الوجبات"
  if (meals.length === 0) {
    const details = fields["تفاصيل الوجبات"];
    if (typeof details === "string" && details.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(details);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m, i) => ({
            id: m.id || `m_${i + 1}`,
            name: m.name || `وجبة ${i + 1}`,
            content: m.content || "",
            key: m.key || `meal_${i + 1}`,
          }));
        }
      } catch {}
    }
  }

  // If still empty, return standard empty 6 slots
  if (meals.length === 0) {
    return STANDARD_MEAL_KEYS.map((cfg, idx) => ({
      id: `m_${idx + 1}`,
      name: cfg.labelAr,
      content: "",
      key: cfg.key,
    }));
  }

  return meals;
}

export function formatFieldsForSave(
  meals: { id?: string; name?: string; content?: string; key?: string }[]
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // Initialize all 6 meal columns
  STANDARD_MEAL_KEYS.forEach((cfg) => {
    fields[cfg.fieldKey] = "";
  });

  // Populate from meals array
  meals.forEach((m, idx) => {
    const content = (m.content || "").trim();
    if (idx < STANDARD_MEAL_KEYS.length) {
      const cfg = STANDARD_MEAL_KEYS[idx];
      fields[cfg.fieldKey] = content;
    }
  });

  // Also populate legacy fields for backwards compatibility
  if (meals[0]?.content) fields["وجبة الإفطار"] = meals[0].content;
  if (meals[2]?.content) fields["وجبة الغداء"] = meals[2].content;
  if (meals[4]?.content) fields["وجبة العشاء"] = meals[4].content;

  // Also save human-readable summary in "تفاصيل الوجبات"
  const formattedSummary = meals
    .filter((m) => Boolean(m.content && m.content.trim()))
    .map((m) => `${m.name || "وجبة"}: ${(m.content || "").trim()}`)
    .join("\n");
  fields["تفاصيل الوجبات"] = formattedSummary || JSON.stringify(meals);

  return fields;
}
