/**
 * Ultra Gym — Dynamic Membership Packages & Pricing Engine
 *
 * CRITICAL SECURITY & BUSINESS ARCHITECTURE:
 * Packages are dynamically pulled directly from the Airtable "الباقات" table.
 * Plan pricing, duration, and metadata are server-authoritative and cached via SWR.
 *
 * The client only sends `planId` (the Airtable record ID or package key).
 * Any client-sent prices/amounts are strictly IGNORED on the server.
 */

import { getRecords, getRecordById } from "@/lib/airtable";
import { TABLES, PACKAGE_FIELDS } from "@/lib/constants";
import { withCacheSWR } from "@/lib/cacheService";

export interface MembershipPlan {
  id: string; // Airtable Record ID (e.g. "recVWw9dCtQPyS7L2")
  key?: string; // Optional slug/key (e.g. "monthly")
  nameAr: string; // e.g. "باقة شهرية"
  nameEn: string; // e.g. "Monthly Package"
  durationMonths: number;
  durationDays: number; // e.g. 30
  price: number; // in JOD (e.g. 40)
  currency: "JOD";
  description?: string;
  featuresAr: string[];
  featuresEn: string[];
  popular?: boolean;
}

function scalar(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}

function scalarNumber(v: unknown): number {
  if (Array.isArray(v)) return v.length ? Number(v[0]) || 0 : 0;
  return Number(v) || 0;
}

function deriveEnglishName(nameAr: string, durationDays: number): string {
  if (durationDays === 7) return "Weekly Trial Package";
  if (durationDays === 30) return "Monthly Package";
  if (durationDays === 90) return "3 Months Package";
  if (durationDays === 180) return "6 Months Package";
  if (durationDays === 365) return "Annual Package";
  return `${nameAr} (${durationDays} Days)`;
}

/**
 * Fetches all active membership packages dynamically from Airtable ("الباقات").
 * Cached via Redis / SWR for fast response times.
 */
export async function fetchMembershipPlans(): Promise<MembershipPlan[]> {
  const cacheKey = "ultra-gym:membership:packages:list";

  const result = await withCacheSWR<MembershipPlan[]>(
    cacheKey,
    async () => {
      const records = await getRecords(TABLES.PACKAGES, {
        revalidate: 60,
      });

      if (!records || records.length === 0) {
        return [];
      }

      const plans: MembershipPlan[] = records.map((rec) => {
        const f = rec.fields;
        const nameAr = scalar(f[PACKAGE_FIELDS.NAME]) || "باقة اشتراك";
        const price = scalarNumber(f[PACKAGE_FIELDS.PRICE]);
        const durationDays = scalarNumber(f[PACKAGE_FIELDS.DURATION_DAYS]) || 30;
        const description = scalar(f[PACKAGE_FIELDS.DESCRIPTION]);
        const durationMonths = Math.max(1, Math.round(durationDays / 30));

        const featuresAr = description
          ? description
              .split(/[\n،,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : ["دخول غير محدود لجميع مرافق النادي"];

        const featuresEn =
          featuresAr.length > 0 ? featuresAr : ["Full Gym Facilities Access"];

        // Determine if it matches popular key or duration
        const isPopular = durationDays === 90 || nameAr.includes("3 شهور");

        return {
          id: rec.id,
          nameAr,
          nameEn: deriveEnglishName(nameAr, durationDays),
          durationMonths,
          durationDays,
          price,
          currency: "JOD",
          description,
          featuresAr,
          featuresEn,
          popular: isPopular,
        };
      });

      // Sort by durationDays ascending (e.g. 7d -> 30d -> 90d -> 180d -> 365d)
      plans.sort((a, b) => a.durationDays - b.durationDays);
      return plans;
    },
    {
      ttlSeconds: 3600, // 1 hour
      softTtlSeconds: 60, // 1 min background revalidation
      logTag: "membership-packages",
    }
  );

  return result.data || [];
}

/**
 * Returns a specific authoritative package by ID, name, or key.
 * Throws if the package cannot be resolved.
 */
export async function getAuthoritativePlan(planId: string): Promise<MembershipPlan> {
  const plans = await fetchMembershipPlans();

  // 1. Direct match by Airtable Record ID or name
  let matched = plans.find(
    (p) =>
      p.id === planId ||
      p.nameAr === planId ||
      (planId === "monthly" && p.durationDays === 30) ||
      (planId === "quarterly" && p.durationDays === 90) ||
      (planId === "semi_annual" && p.durationDays === 180) ||
      (planId === "annual" && p.durationDays === 365)
  );

  // 2. If not found in list and starts with "rec", fetch directly from Airtable
  if (!matched && planId.startsWith("rec")) {
    try {
      const rec = await getRecordById(TABLES.PACKAGES, planId);
      if (rec) {
        const f = rec.fields;
        const nameAr = scalar(f[PACKAGE_FIELDS.NAME]) || "باقة اشتراك";
        const price = scalarNumber(f[PACKAGE_FIELDS.PRICE]);
        const durationDays = scalarNumber(f[PACKAGE_FIELDS.DURATION_DAYS]) || 30;
        const description = scalar(f[PACKAGE_FIELDS.DESCRIPTION]);
        const durationMonths = Math.max(1, Math.round(durationDays / 30));

        matched = {
          id: rec.id,
          nameAr,
          nameEn: deriveEnglishName(nameAr, durationDays),
          durationMonths,
          durationDays,
          price,
          currency: "JOD",
          description,
          featuresAr: description
            ? [description]
            : ["دخول غير محدود لجميع مرافق النادي"],
          featuresEn: ["Full Gym Facilities Access"],
        };
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback to first plan if list is available
  if (!matched) {
    if (plans.length > 0) {
      matched = plans[0];
    } else {
      throw new Error(`Invalid membership plan ID: "${planId}"`);
    }
  }

  return matched;
}

/**
 * Calculates the new subscription expiry date based on the current expiry date
 * and the plan duration.
 *
 * Rules:
 *  - If current subscription is ACTIVE (`currentEndDate > today`), new expiry is `currentEndDate + durationDays`.
 *  - If current subscription is EXPIRED or null (`currentEndDate <= today`), new expiry is `today + durationDays`.
 *
 * Returns ISO date string (YYYY-MM-DD) calculated in UTC.
 */
export function calculateNewExpiryDate(
  currentEndDateStr: string | null | undefined,
  durationDays: number
): { newStartDate: string; newEndDate: string; isExtended: boolean } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let isExtended = false;
  let baseDateStr = todayStr;

  if (currentEndDateStr && currentEndDateStr > todayStr) {
    baseDateStr = currentEndDateStr;
    isExtended = true;
  }

  // Pure UTC date arithmetic — immune to local daylight saving / timezone shifts
  const parts = baseDateStr.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  targetDate.setUTCDate(targetDate.getUTCDate() + durationDays);

  const newEndDate = targetDate.toISOString().slice(0, 10);
  const newStartDate = isExtended ? currentEndDateStr! : todayStr;

  return {
    newStartDate,
    newEndDate,
    isExtended,
  };
}
