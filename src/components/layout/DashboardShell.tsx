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
import { clientFetch } from "@/lib/clientCache";

// A member with no active subscription ("منتهي" — expired, or "غير مشترك" —
// never subscribed at all) is locked to the home page only: every other
// route bounces back to /home, and Sidebar/MobileNav only render the Home
// item.
const LOCKED_SUB_STATUSES = new Set(["منتهي", "غير مشترك"]);

export default function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  const [memberPlan, setMemberPlan] = useState<{ planType?: string; subEndDate?: string } | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // Background Auth & Session Verification:
    // Only a confirmed 401 redirects to /login.
    // Non-blocking so the App Shell renders immediately.
    const check = (isRetry: boolean) => {
      clientFetch<any>("/api/auth/me", undefined, { ttlMs: 30000 })
        .then((session) => {
          if (cancelled || !session) return;
          // Trainer credentials bounce to trainer portal
          if (session.role === "trainer") {
            window.location.href = "/trainer";
            return;
          }
          if (session) {
            // Track IP once per device/browser using localStorage
            try {
              if (typeof window !== "undefined" && !localStorage.getItem("ip_tracked")) {
                fetch("/api/track-ip", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    memberId: session.memberId || session.recordId || session.id,
                  }),
                }).catch(() => {});
                localStorage.setItem("ip_tracked", "1");
              }
            } catch {}

            // Member portal — check subscription status
            const status = (session.subscriptionStatus ?? "").trim();
            const isLocked = LOCKED_SUB_STATUSES.has(status);
            setLocked(isLocked);
            setMemberPlan({
              planType: session.planType || session.subscriptionStatus,
              subEndDate: session.subEndDate,
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (isRetry) {
            window.location.href = "/login";
          } else {
            setTimeout(() => check(true), 2000);
          }
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
