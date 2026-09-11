/**
 * Ultra Gym — Dynamic Subscription Duration & Period Engine
 *
 * Resolves precise subscription duration (total days, days remaining, elapsed days,
 * and completion percentage) for any member, whether their plan is:
 * - 1 Week (7 days)
 * - 1 Month (30 days)
 * - 3 Months (90 days)
 * - 6 Months (180 days)
 * - 1 Year (365 days)
 * - Or custom duration calculated via start/end dates.
 */

import { daysUntilEnd, spanDays } from "@/lib/format";

export interface SubscriptionPeriodInfo {
  /** Days left until expiry (null if no subscription data, <=0 if expired) */
  daysLeft: number | null;
  /** Total duration in days of this subscription cycle (e.g. 30, 90, 180, 365) */
  totalDays: number;
  /** Normalized fraction from 0.0 (expired/empty) to 1.0 (full/starting) */
  fraction: number;
  /** Percentage of subscription remaining: 0 to 100 */
  percentageLeft: number;
  /** Percentage of subscription already elapsed: 0 to 100 */
  percentageElapsed: number;
  /** Number of days consumed so far */
  daysElapsed: number;
  /** Inferred or stated plan title */
  planTitle: string;
  /** Whether the subscription is expired */
  isExpired: boolean;
  /** Color tier for UI indicators: 'emerald' | 'amber' | 'rose' */
  statusTier: "emerald" | "amber" | "rose";
}

/**
 * Extracts subscription total duration in days from text (planType or subStatus).
 */
export function parseDurationFromText(text?: string | null): number | null {
  if (!text || typeof text !== "string") return null;
  const s = text.trim().toLowerCase();

  // 1. Explicit standard Arabic & English packages
  if (s.includes("سنة") || s.includes("سنوي") || s.includes("12 شهر") || s.includes("12 months") || s.includes("annual") || s.includes("1 year")) {
    return 365;
  }
  if (s.includes("6 شهور") || s.includes("6 أشهر") || s.includes("نصف سنوي") || s.includes("6 months") || s.includes("semi-annual")) {
    return 180;
  }
  if (s.includes("3 شهور") || s.includes("3 أشهر") || s.includes("ربع سنوي") || s.includes("3 months") || s.includes("quarterly")) {
    return 90;
  }
  if (s.includes("شهرين") || s.includes("2 شهر") || s.includes("2 أشهر") || s.includes("2 months")) {
    return 60;
  }
  if (s.includes("شهر") || s.includes("شهري") || s.includes("1 month") || s.includes("monthly") || s.includes("30 يوم")) {
    return 30;
  }
  if (s.includes("أسبوع") || s.includes("اسبوع") || s.includes("7 أيام") || s.includes("weekly") || s.includes("1 week")) {
    return 7;
  }

  // 2. Regex matching for numbers + time units
  const yearMatch = s.match(/(\d+)\s*(?:سنة|سنوات|years?|yr|y)/);
  if (yearMatch) return Math.max(1, parseInt(yearMatch[1], 10)) * 365;

  const monthMatch = s.match(/(\d+)\s*(?:شهر|أشهر|شهور|months?|mo|m)/);
  if (monthMatch) return Math.max(1, parseInt(monthMatch[1], 10)) * 30;

  const weekMatch = s.match(/(\d+)\s*(?:أسبوع|اسبوع|أسابيع|weeks?|w)/);
  if (weekMatch) return Math.max(1, parseInt(weekMatch[1], 10)) * 7;

  const dayMatch = s.match(/(\d+)\s*(?:يوم|أيام|days?|d)/);
  if (dayMatch) return Math.max(1, parseInt(dayMatch[1], 10));

  return null;
}

/**
 * Infers the closest standard gym package tier that comfortably accommodates the given days.
 */
export function inferStandardTier(days: number): number {
  if (days <= 0) return 30;
  if (days > 180) return 365; // Annual tier
  if (days > 90) return 180;  // 6-month tier
  if (days > 30) return 90;   // 3-month tier
  if (days > 7) return 30;    // 1-month tier
  return Math.max(7, days);
}

export interface ResolvePeriodInput {
  subStartDate?: unknown;
  subEndDate?: unknown;
  daysRemaining?: unknown;
  planType?: unknown;
  subStatus?: unknown;
  subscriptionStatus?: unknown;
}

/**
 * Authoritatively calculates all subscription duration metrics.
 */
export function resolveSubscriptionPeriod(input: ResolvePeriodInput | null | undefined): SubscriptionPeriodInfo {
  if (!input) {
    return {
      daysLeft: null,
      totalDays: 30,
      fraction: 0,
      percentageLeft: 0,
      percentageElapsed: 100,
      daysElapsed: 0,
      planTitle: "",
      isExpired: true,
      statusTier: "rose",
    };
  }

  // Normalize inputs
  const unwrapScalar = (v: unknown): string | undefined => {
    if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined;
    return v != null && v !== "" ? String(v) : undefined;
  };

  const startDate = unwrapScalar(input.subStartDate);
  const endDate = unwrapScalar(input.subEndDate);
  const planTypeRaw = unwrapScalar(input.planType) || unwrapScalar(input.subscriptionStatus) || "";
  const subStatusRaw = unwrapScalar(input.subStatus) || "";

  // 1. Calculate days left
  let daysLeft: number | null = null;
  if (endDate) {
    daysLeft = daysUntilEnd(endDate);
  }
  if (daysLeft == null && input.daysRemaining != null) {
    const rawDays = unwrapScalar(input.daysRemaining);
    const parsed = Number(rawDays);
    if (!isNaN(parsed)) {
      daysLeft = parsed;
    }
  }

  const isExplicitlyEnded = subStatusRaw === "منتهي" || subStatusRaw === "غير مشترك";
  const isExpired = isExplicitlyEnded || (daysLeft !== null && daysLeft <= 0);

  // 2. Calculate total days
  let totalDays: number | null = null;

  // Method A: Exact start to end date span
  if (startDate && endDate) {
    const span = spanDays(startDate, endDate);
    if (span != null && span > 0) {
      totalDays = span;
    }
  }

  // Method B: Parse duration from plan title text
  if (!totalDays || (daysLeft != null && totalDays < daysLeft)) {
    const parsedFromPlan = parseDurationFromText(planTypeRaw);
    if (parsedFromPlan && parsedFromPlan > 0) {
      totalDays = parsedFromPlan;
    }
  }

  // Method C: Infer standard tier from remaining days
  if (!totalDays || (daysLeft != null && totalDays < daysLeft)) {
    totalDays = inferStandardTier(daysLeft ?? 30);
  }

  // Ensure totalDays is strictly positive and at least as large as daysLeft
  totalDays = Math.max(totalDays, daysLeft ?? 0, 1);

  // 3. Compute fraction & percentages
  const safeDaysLeft = daysLeft != null ? Math.max(0, daysLeft) : 0;
  const fraction = isExpired ? 0 : Math.min(Math.max(safeDaysLeft / totalDays, 0), 1);
  const percentageLeft = Math.round(fraction * 100);
  const percentageElapsed = Math.min(100, Math.max(0, 100 - percentageLeft));
  const daysElapsed = isExpired ? totalDays : Math.max(0, totalDays - safeDaysLeft);

  // 4. Status Tier
  let statusTier: "emerald" | "amber" | "rose" = "emerald";
  if (isExpired || percentageLeft <= 15 || (daysLeft != null && daysLeft <= 5)) {
    statusTier = "rose";
  } else if (percentageLeft <= 35 || (daysLeft != null && daysLeft <= 14)) {
    statusTier = "amber";
  }

  return {
    daysLeft,
    totalDays,
    fraction,
    percentageLeft,
    percentageElapsed,
    daysElapsed,
    planTitle: planTypeRaw || (totalDays >= 365 ? "باقة سنوية" : totalDays >= 180 ? "باقة 6 شهور" : totalDays >= 90 ? "باقة 3 شهور" : "باقة شهرية"),
    isExpired,
    statusTier,
  };
}
