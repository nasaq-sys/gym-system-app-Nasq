import ar from "./ar.json";
import en from "./en.json";
import type { Locale } from "@/lib/constants";

const dictionaries = { ar, en } as const;

export type TranslationDict = typeof ar;

export function getDictionary(locale: Locale) {
  return dictionaries[locale] ?? dictionaries.ar;
}

export function t(
  dict: TranslationDict,
  path: string,
  params?: Record<string, string>
): string {
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = dict;
  for (const key of keys) {
    if (value == null || typeof value !== "object") return path;
    value = value[key];
  }
  if (typeof value !== "string") return path;
  if (!params) return value;
  return Object.entries(params).reduce<string>(
    (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, "g"), v),
    value
  );
}
