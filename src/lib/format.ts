/**
 * Shared display-formatting helpers.
 *
 * Airtable often returns single-select / lookup fields as a 1-element array
 * instead of a plain scalar, and empty fields as "" or undefined. Every
 * helper here normalizes that shape so page components never repeat the
 * same `Array.isArray(x) ? x[0] : x` dance.
 *
 * Import from here instead of redefining `fmt`/`formatLongDate`/etc. in a
 * page file — several pages had their own copies before this module existed.
 */

/** Unwrap an Airtable lookup value (`x` or `[x]`) down to a single scalar. */
function unwrap(val: unknown): unknown {
  return Array.isArray(val) ? val[0] : val;
}

/** Format any Airtable field for display, falling back to "---" when empty. */
export function fmt(val: unknown, suffix?: string): string {
  const v = unwrap(val);
  if (v == null || v === "") return "---";
  return suffix ? `${v} ${suffix}` : String(v);
}

/** Format a numeric Airtable field (e.g. balance) as JOD currency. */
export function fmtCurrency(val: unknown): string {
  const v = unwrap(val);
  if (v == null) return "---";
  const num = Number(v);
  if (isNaN(num)) return "---";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "JOD",
    minimumFractionDigits: 0,
  });
}

/** Format a date field as a long localized date ("12 أغسطس 2026" / "August 12, 2026"). */
export function formatLongDate(raw: unknown, locale: string): string {
  const v = unwrap(raw);
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Whole days between today and a future date field (negative once past). */
export function daysUntilEnd(raw: unknown): number | null {
  const v = unwrap(raw);
  if (v == null || v === "") return null;
  const end = new Date(String(v));
  if (isNaN(end.getTime())) return null;
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** Format a minute count as "1 س 15 د" / "1h 15m" — spaced out (not "1س15د")
 *  per explicit design feedback. Omits the hour part entirely under 60. */
export function formatDuration(totalMinutes: number, locale: string): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (locale === "ar") {
    return h > 0 ? `${h} س ${m} د` : `${m} د`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Sun→Sat full weekday names via Intl, so English/Arabic both come from
 *  the platform's own locale data instead of a hand-maintained array. Any
 *  fixed week works — 2024-01-07 was a Sunday. Index 0 = Sunday. */
export function weekdayFullLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    weekday: "long",
  });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

/** Inclusive day count between a start and end date field. */
export function spanDays(startRaw: unknown, endRaw: unknown): number | null {
  const s = new Date(String(unwrap(startRaw)));
  const e = new Date(String(unwrap(endRaw)));
  if (startRaw == null || endRaw == null || isNaN(s.getTime()) || isNaN(e.getTime())) {
    return null;
  }
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}
