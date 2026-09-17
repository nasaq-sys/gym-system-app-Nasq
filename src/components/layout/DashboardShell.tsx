"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import Topbar from "./Topbar";
import ChatWidget from "@/components/shared/ChatWidget";
import CartSheet from "@/components/shared/CartSheet";
import ExpiredSubscriptionModal from "@/components/shared/ExpiredSubscriptionModal";
import { CartProvider } from "@/lib/CartProvider";
import { WorkoutTimerProvider } from "@/lib/WorkoutTimerProvider";
import WorkoutRestTimer from "@/components/shared/WorkoutRestTimer";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";
import { resolveSubscriptionPeriod } from "@/lib/subscriptionUtils";

// A member with no active subscription ("منتهي" — expired, or "غير مشترك" —
// never subscribed at all, or daysRemaining <= 0) is locked to the home page only:
// every other route bounces back to /home, and Sidebar/MobileNav only render the Home item.
const LOCKED_SUB_STATUSES = new Set([
  "منتهي",
  "غير مشترك",
  "expired",
  "inactive",
  "موقوف",
  "ملغي",
  "معلق",
]);

function isMemberSubscriptionExpired(member: any): boolean {
  if (!member) return false;
  const subPeriod = resolveSubscriptionPeriod(member);
  const rawSubStatus = String(member.subStatus || "").trim().toLowerCase();
  const rawSubStatusAlt = String(member.subscriptionStatus || "").trim().toLowerCase();

  return (
    subPeriod.isExpired ||
    LOCKED_SUB_STATUSES.has(rawSubStatus) ||
    LOCKED_SUB_STATUSES.has(rawSubStatusAlt)
  );
}

export default function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Instant synchronous initial check from client memory cache
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const cached = getClientCachedData<any>("/api/members");
    return isMemberSubscriptionExpired(cached?.data || cached);
  });

  const [memberPlan, setMemberPlan] = useState<{ planType?: string; subEndDate?: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const cached = getClientCachedData<any>("/api/members");
    const m = cached?.data || cached;
    if (!m) return null;
    return {
      planType: m.planType || m.subscriptionStatus || "عضوية قياسية",
      subEndDate: Array.isArray(m.subEndDate) ? m.subEndDate[0] : m.subEndDate,
    };
  });

  useEffect(() => {
    let cancelled = false;

    // Background Auth & Member Subscription Verification:
    // Only a confirmed 401 redirects to /login.
    // Non-blocking so the App Shell renders immediately.
    const check = (isRetry: boolean) => {
      clientFetch<any>("/api/auth/me", undefined, { ttlMs: 30000 })
        .then((session) => {
          if (cancelled || !session) return;
          const s = session.data || session;

          // Trainer credentials bounce to trainer portal
          if (s.role === "trainer") {
            window.location.href = "/trainer";
            return;
          }

          // Admin users have full unrestricted access
          if (s.role === "admin") {
            setLocked(false);
            return;
          }

          // Track IP once per device/browser using localStorage
          try {
            if (typeof window !== "undefined" && !localStorage.getItem("ip_tracked")) {
              fetch("/api/track-ip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  memberId: s.memberId || s.recordId || s.id,
                }),
              }).catch(() => {});
              localStorage.setItem("ip_tracked", "1");
            }
          } catch {}

          // Member portal — check live authoritative subscription status from /api/members
          clientFetch<any>("/api/members", undefined, { ttlMs: 30000 })
            .then((memberRes) => {
              if (cancelled || !memberRes) return;
              const member = memberRes.data || memberRes;

              const isLocked = isMemberSubscriptionExpired(member);
              setLocked(isLocked);
              setMemberPlan({
                planType: member.planType || member.subscriptionStatus || "عضوية قياسية",
                subEndDate: Array.isArray(member.subEndDate) ? member.subEndDate[0] : member.subEndDate,
              });
            })
            .catch(() => {});
        })
        .catch(() => {
          if (cancelled) return;
          window.location.href = "/login";
        });
    };

    check(false);
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle deep link scheme routing (e.g. ultragym://widget?action=workout)
  useEffect(() => {
    const handleDeepLinkUrl = (urlStr: string) => {
      try {
        if (!urlStr || !urlStr.startsWith("ultragym://")) return;
        const parsed = new URL(urlStr.replace("ultragym://", "https://ultragym.app/"));
        const action = parsed.searchParams.get("action") || parsed.pathname.replace("/", "");

        switch (action) {
          case "workout":
          case "rest":
            router.push("/workouts");
            break;
          case "occupancy":
            router.push("/home");
            break;
          case "subscription":
          case "body":
            router.push("/profile");
            break;
          case "login":
            router.push("/login");
            break;
          default:
            break;
        }
      } catch {
        // ignore
      }
    };

    // Listen for custom Capacitor appUrlOpen events if available
    const handleUrlOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string }>;
      if (customEvent.detail?.url) {
        handleDeepLinkUrl(customEvent.detail.url);
      }
    };

    window.addEventListener("appUrlOpen", handleUrlOpen);
    return () => {
      window.removeEventListener("appUrlOpen", handleUrlOpen);
    };
  }, [router]);

  // Re-runs on every client-side navigation — enforces locked subscription state
  // Exempts /payment routes so members can complete checkout and view payment results.
  useEffect(() => {
    if (locked && pathname !== "/home" && !pathname.startsWith("/payment")) {
      router.replace("/home");
    }
  }, [locked, pathname, router]);

  // If the member is locked and attempts to view any non-home / non-payment page,
  // do not render the protected page content while redirection is occurring.
  if (locked && pathname !== "/home" && !pathname.startsWith("/payment")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <WorkoutTimerProvider>
      <CartProvider>
        <div className="min-h-screen bg-background flex">
          <Sidebar restricted={locked} />
          <div className="flex-1 flex flex-col min-h-screen min-w-0">
            <Topbar restricted={locked} />
            <main className="flex-1 p-4 md:p-6 pb-28 md:pb-6 animate-fade-in">
              <div className="max-w-6xl mx-auto w-full">{children}</div>
            </main>
          </div>
          <MobileNav restricted={locked} />
          <ChatWidget />
          <CartSheet />
          <WorkoutRestTimer />
          {locked && !pathname.startsWith("/payment") && (
            <ExpiredSubscriptionModal
              planName={memberPlan?.planType}
              subEndDate={memberPlan?.subEndDate}
            />
          )}
        </div>
      </CartProvider>
    </WorkoutTimerProvider>
  );
}
