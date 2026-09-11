/**
 * Ultra Gym — Auto-Translation Dictionary for Lost & Found Items & Locations
 *
 * Provides bidirectional translation between Arabic and English for user-entered
 * and admin-entered items, locations, and descriptions.
 */

const LOCATION_DICTIONARY: Array<{ ar: RegExp | string; en: string }> = [
  { ar: /منطقة الحديد|صالة الأثقال|الحديد/gi, en: "Free Weights Area" },
  { ar: /المطبخ|الكافيه|كافيه/gi, en: "Kitchen & Cafe" },
  { ar: /غرفة تبديل الملابس|غرفة التبديل|الخزائن|الخزانة/gi, en: "Locker Room" },
  { ar: /صالة الكارديو|الكارديو/gi, en: "Cardio Area" },
  { ar: /الاستقبال|مكتب الاستقبال/gi, en: "Reception Desk" },
  { ar: /المسبح|مسبح/gi, en: "Swimming Pool" },
  { ar: /الساونا|البخار|الجاكوزي/gi, en: "Sauna & Steam Room" },
  { ar: /صالة الفنون القتالية|الملاكمة/gi, en: "Martial Arts Studio" },
  { ar: /صالة الكلاسات|الكلاسات/gi, en: "Group Fitness Studio" },
  { ar: /مواقف السيارات|المواقف|البارك/gi, en: "Parking Area" },
  { ar: /الحمامات|الشاور|دورات المياه/gi, en: "Showers & Restrooms" },
];

const ITEM_NAME_DICTIONARY: Array<{ ar: RegExp | string; en: string }> = [
  { ar: /مفتاح خزانة|مفتاح الخزانة/gi, en: "Locker Key" },
  { ar: /مفتاح سيارة|مفتاح السيارة/gi, en: "Car Key" },
  { ar: /مفتاح|مفاتيح/gi, en: "Key / Keys" },
  { ar: /سماعات بلوتوث|سماعة بلوتوث/gi, en: "Bluetooth Earbuds" },
  { ar: /سماعات بيض|سماعات بيضاء/gi, en: "White Headphones" },
  { ar: /سماعات سوداء|سماعات سود/gi, en: "Black Headphones" },
  { ar: /سماعات|سماعة/gi, en: "Headphones" },
  { ar: /ساعة ذكية|ساعة يد/gi, en: "Smartwatch" },
  { ar: /ساعة/gi, en: "Watch" },
  { ar: /هاتف ايفون|ايفون|أيفون/gi, en: "iPhone" },
  { ar: /هاتف سامسونج|سامسونج/gi, en: "Samsung Phone" },
  { ar: /هاتف|موبايل|تلفون|جوال/gi, en: "Mobile Phone" },
  { ar: /محفظة جلدية|محفظة رجالية|محفظة/gi, en: "Wallet" },
  { ar: /شيكر بروتين|شيكر/gi, en: "Protein Shaker" },
  { ar: /مطرة ماء|زجاجة ماء|قنينة ماء/gi, en: "Water Bottle" },
  { ar: /حزام تمرين|حزام رفع أثقال|حزام/gi, en: "Weightlifting Belt" },
  { ar: /حذاء رياضي|شوز|حذاء/gi, en: "Gym Shoes / Sneakers" },
  { ar: /حقيبة رياضية|شنطة رياضية|شنطة|حقيبة/gi, en: "Gym Bag" },
  { ar: /منشفة رياضية|منشفة|فوطة/gi, en: "Gym Towel" },
  { ar: /بطاقة عضوية|هوية|بطاقة/gi, en: "ID / Membership Card" },
  { ar: /نظارة شمسية|نظارة طبية|نظارة/gi, en: "Glasses / Sunglasses" },
  { ar: /سترة|جاكيت|كنزة|بلوزة/gi, en: "Jacket / Shirt" },
  { ar: /قفازات تمرين|كفوف|دسوس/gi, en: "Workout Gloves" },
];

const WORDS_DICTIONARY: Record<string, string> = {
  "مفتاح": "Key",
  "غرفة": "Room",
  "مع": "with",
  "علاقة": "keychain",
  "زرقاء": "blue",
  "حمراء": "red",
  "سوداء": "black",
  "بيضاء": "white",
  "بيض": "white",
  "سود": "black",
  "رمادية": "grey",
  "صغيرة": "small",
  "كبيرة": "large",
  "جديدة": "new",
  "قديمة": "old",
  "جلد": "leather",
  "بلاستيك": "plastic",
  "حديد": "metal",
  "أبل": "Apple",
  "سامسونج": "Samsung",
  "سوني": "Sony",
  "نايك": "Nike",
  "أديداس": "Adidas",
};

/**
 * Translates item names, locations, and descriptions dynamically between Arabic and English.
 */
export function translateLostFoundText(
  text: string | undefined | null,
  targetLang: "ar" | "en"
): string {
  if (!text || !text.trim()) return "";
  const trimmed = text.trim();

  // If target language is Arabic and text already has Arabic characters, keep as is
  const hasArabic = /[\u0600-\u06FF]/.test(trimmed);
  if (targetLang === "ar" && hasArabic) {
    return trimmed;
  }

  // If target language is English and text already has no Arabic characters, keep as is
  if (targetLang === "en" && !hasArabic) {
    return trimmed;
  }

  // 1. Check Location Dictionary
  for (const item of LOCATION_DICTIONARY) {
    if (typeof item.ar === "string" && trimmed.toLowerCase() === item.ar.toLowerCase()) {
      return targetLang === "en" ? item.en : (typeof item.ar === "string" ? item.ar : trimmed);
    }
    if (item.ar instanceof RegExp && item.ar.test(trimmed)) {
      if (targetLang === "en") return item.en;
    }
    if (targetLang === "ar" && item.en.toLowerCase() === trimmed.toLowerCase()) {
      return typeof item.ar === "string" ? item.ar : item.en;
    }
  }

  // 2. Check Item Name Dictionary
  for (const item of ITEM_NAME_DICTIONARY) {
    if (typeof item.ar === "string" && trimmed.toLowerCase() === item.ar.toLowerCase()) {
      return targetLang === "en" ? item.en : (typeof item.ar === "string" ? item.ar : trimmed);
    }
    if (item.ar instanceof RegExp && item.ar.test(trimmed)) {
      if (targetLang === "en") return item.en;
    }
    if (targetLang === "ar" && item.en.toLowerCase() === trimmed.toLowerCase()) {
      return typeof item.ar === "string" ? item.ar : item.en;
    }
  }

  // 3. Fallback Smart Sentence Translation for English target
  if (targetLang === "en" && hasArabic) {
    let result = trimmed;
    // Replace known words
    for (const [arWord, enWord] of Object.entries(WORDS_DICTIONARY)) {
      const reg = new RegExp(`\\b${arWord}\\b|${arWord}`, "g");
      result = result.replace(reg, enWord);
    }
    return result;
  }

  return trimmed;
}
