"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/clientCache";

/**
 * Hook to retrieve member gender and boolean flag for female styling/branding.
 * Uses localStorage cache to prevent icon flicker and maintain persistent gender state.
 */
export function useMemberGender() {
  const [isFemale, setIsFemale] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("ug_gender") === "female";
    } catch {
      return false;
    }
  });

  const [gender, setGender] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      return localStorage.getItem("ug_gender_raw") || undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    let cancelled = false;

    clientFetch<any>("/api/members", undefined, { ttlMs: 60000 })
      .then((res) => {
        if (cancelled || !res) return;
        const data = res?.data || res;
        const raw = String(data?.gender || "").trim();
        const g = raw.toLowerCase();
        const female =
          g.includes("انثى") ||
          g.includes("أنثى") ||
          g.includes("انثي") ||
          g.includes("أنثي") ||
          g.includes("female") ||
          g.includes("بنت") ||
          g === "f";

        setGender(raw);
        setIsFemale(female);

        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("ug_gender", female ? "female" : "male");
            if (raw) localStorage.setItem("ug_gender_raw", raw);
          }
        } catch {}
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return { isFemale, gender };
}
