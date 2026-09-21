"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Compass,
  MoreHorizontal,
  Share,
  PlusSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { NasaqIconMark } from "@/components/shared/BrandLogo";

// Chrome/Edge/Android beforeinstallprompt event interface
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// ── Environment & Platform Helpers ─────────────────────────────────────────

export function isCurrentWindowStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const isStandaloneMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  const isFullscreenMedia = window.matchMedia?.("(display-mode: fullscreen)").matches;
  const isMinimalUiMedia = window.matchMedia?.("(display-mode: minimal-ui)").matches;
  const isIOSStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isAndroidReferrer =
    typeof document !== "undefined" && document.referrer.startsWith("android-app://");

  return !!(
    isStandaloneMedia ||
    isFullscreenMedia ||
    isMinimalUiMedia ||
    isIOSStandalone ||
    isAndroidReferrer
  );
}

export const isAppInstalled = isCurrentWindowStandalone;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOSUA = /iphone|ipad|ipod/i.test(ua);
  const isIPadOS =
    (navigator.platform === "MacIntel" || ua.includes("Macintosh")) &&
    navigator.maxTouchPoints > 1;
  return isIOSUA || isIPadOS;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent || "");
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isIOS() ||
    isAndroid() ||
    window.innerWidth < 768 ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  );
}

// ── Storage & Cooldown Keys ───────────────────────────────────────────────

const SESSION_DISMISS_KEY = "ultra_gym_install_dismissed_session";
const COOLDOWN_KEY = "ultra_gym_install_cooldown_until";
const COOLDOWN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function isPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
      return true;
    }
    const cooldownStr = localStorage.getItem(COOLDOWN_KEY);
    if (cooldownStr) {
      const cooldownUntil = parseInt(cooldownStr, 10);
      if (!isNaN(cooldownUntil) && Date.now() < cooldownUntil) {
        return true;
      }
      localStorage.removeItem(COOLDOWN_KEY);
    }
  } catch {
    // Ignore
  }
  return false;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [stepView, setStepView] = useState<"initial" | "instructions">("initial");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { t, locale } = useI18n();
  const isAr = locale === "ar";

  useEffect(() => {
    // 1. Allow manual test preview via URL parameter (e.g. ?pwa_preview=1) or console command
    const isExplicitPreview =
      typeof window !== "undefined" &&
      (window.location.search.includes("pwa_preview") ||
        window.location.search.includes("install_preview"));

    // 2. Standalone window detection (skip if running as installed PWA, unless explicit preview)
    if (isCurrentWindowStandalone() && !isExplicitPreview) {
      return;
    }

    // 3. Check dismissal & cooldown (unless explicit preview)
    if (isPromptDismissed() && !isExplicitPreview) {
      return;
    }

    // 4. Global debug / manual trigger helpers
    if (typeof window !== "undefined") {
      (window as unknown as { __showPwaInstall__?: () => void }).__showPwaInstall__ = () => {
        setVisible(true);
        setStepView("initial");
      };
      (window as unknown as { __resetPwaInstall__?: () => void }).__resetPwaInstall__ = () => {
        try {
          sessionStorage.removeItem(SESSION_DISMISS_KEY);
          localStorage.removeItem(COOLDOWN_KEY);
          setVisible(true);
          console.log("[PWA Install] Reset done & prompt opened.");
        } catch {}
      };
    }

    let timer: number | undefined;

    const triggerShow = () => {
      timer = window.setTimeout(() => {
        setVisible(true);
      }, 1000);
    };

    // Capture early Chromium beforeinstallprompt
    const earlyPrompt =
      typeof window !== "undefined"
        ? (window as unknown as { __pwaDeferredPrompt?: BeforeInstallPromptEvent })
            .__pwaDeferredPrompt
        : null;

    if (earlyPrompt) {
      setDeferredPrompt(earlyPrompt);
      triggerShow();
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      triggerShow();
    };

    const onAppInstalled = () => {
      setVisible(false);
      try {
        sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Show for iOS or Mobile browsers or explicit preview
    if (isIOS() || isMobileDevice() || isExplicitPreview) {
      triggerShow();
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setStepView("initial");
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
      localStorage.setItem(COOLDOWN_KEY, (Date.now() + COOLDOWN_DURATION_MS).toString());
    } catch {}
  }, []);

  const handleInstallClick = useCallback(async () => {
    // If native prompt is available (Android / Chromium)
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          handleDismiss();
          return;
        }
      } catch (err) {
        console.error("Native prompt error:", err);
      }
    }

    // On iOS or when native prompt is not supported, expand to step-by-step instructions
    setStepView("instructions");
  }, [deferredPrompt, handleDismiss]);

  if (!visible || (isCurrentWindowStandalone() && !visible)) return null;

  return (
    <>
      {/* Dark Subtle Backdrop */}
      <div
        onClick={handleDismiss}
        className="fixed inset-0 z-[998] bg-black/45 backdrop-blur-xs animate-in fade-in duration-300"
        aria-hidden="true"
      />

      {/* ── iOS Frosted Glass Floating Card ── */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          backdropFilter: "blur(32px) saturate(190%) brightness(95%)",
          WebkitBackdropFilter: "blur(32px) saturate(190%) brightness(95%)",
        }}
        className={cn(
          "fixed z-[999] max-w-[360px] sm:max-w-[390px] w-[92%]",
          "inset-x-0 bottom-6 sm:bottom-8 mx-auto",
          "bg-gradient-to-b from-blue-950/60 to-slate-950/80 dark:from-[#08152e]/95 dark:to-[#040915]/95",
          "border border-blue-400/30 dark:border-blue-500/35",
          "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.25),0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(37,99,235,0.25)]",
          "text-white rounded-[32px] p-5 sm:p-6",
          "animate-in zoom-in-95 slide-in-from-bottom-6 duration-300"
        )}
      >
        {/* ── Top Glass Sheen Overlay ── */}
        <div className="absolute inset-x-0 top-0 h-24 rounded-t-[32px] bg-gradient-to-b from-blue-400/15 to-transparent pointer-events-none" />

        {/* ── HEADER ── */}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon Container with Glass Border */}
            <div className="shrink-0 shadow-lg shadow-blue-500/20">
              <NasaqIconMark className="w-12 h-12 rounded-2xl" />
            </div>

            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-white leading-tight drop-shadow-sm">
                {t("pwaInstall.title")}
              </h3>
              <p className="text-xs text-blue-200/90 leading-tight mt-0.5">
                {t("pwaInstall.subtitle")}
              </p>
            </div>
          </div>

          {/* Frosted Glass Close (X) Button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t("pwaInstall.close")}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 border border-white/20 backdrop-blur-md text-white/90 hover:text-white flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Glass Divider */}
        <div className="relative z-10 border-b border-blue-400/20 my-3.5" />

        {/* ── VIEW 1: INITIAL PROMPT ── */}
        {stepView === "initial" ? (
          <div className="relative z-10 space-y-4 animate-in fade-in duration-200">
            <p className="text-xs sm:text-[13px] text-white/90 leading-relaxed font-medium drop-shadow-xs">
              {t("pwaInstall.description")}
            </p>

            {/* Blue Primary Action Button */}
            <button
              type="button"
              onClick={handleInstallClick}
              className={cn(
                "w-full h-12 rounded-2xl",
                "bg-primary hover:brightness-110 active:scale-98",
                "border border-primary/40 text-primary-foreground font-extrabold text-xs sm:text-sm",
                "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.3),0_8px_25px_rgba(37,99,235,0.35)]",
                "flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              )}
            >
              <div className="w-5 h-5 rounded-md border border-white/50 bg-white/20 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <span className="drop-shadow-xs">{t("pwaInstall.addButton")}</span>
            </button>
          </div>
        ) : (
          /* ── VIEW 2: STEP-BY-STEP INSTRUCTIONS ── */
          <div className="relative z-10 space-y-2.5 pt-0.5 animate-in fade-in duration-200">
            <p className="text-xs text-white/80 leading-relaxed pb-1 font-medium">
              {t("pwaInstall.description")}
            </p>

            {/* Step 1: Open in Safari / Main Browser */}
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-blue-400/20 backdrop-blur-md transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-500/25 border border-blue-400/35 backdrop-blur-md flex items-center justify-center text-blue-200 shrink-0 shadow-inner">
                <Compass className="w-5 h-5 text-blue-200" />
              </div>
              <span className="text-xs font-semibold text-white/95 leading-tight drop-shadow-xs">
                {t("pwaInstall.step1")}
              </span>
            </div>

            {/* Step 2: More button if no share */}
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-blue-400/20 backdrop-blur-md transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-500/25 border border-blue-400/35 backdrop-blur-md flex items-center justify-center text-blue-200 shrink-0 shadow-inner">
                <MoreHorizontal className="w-5 h-5 text-blue-200" />
              </div>
              <span className="text-xs font-semibold text-white/95 leading-tight drop-shadow-xs">
                {t("pwaInstall.step2")}
              </span>
            </div>

            {/* Step 3: Press Share */}
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-blue-400/20 backdrop-blur-md transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-500/25 border border-blue-400/35 backdrop-blur-md flex items-center justify-center text-blue-200 shrink-0 shadow-inner">
                <Share className="w-5 h-5 text-blue-200" />
              </div>
              <span className="text-xs font-semibold text-white/95 leading-tight drop-shadow-xs">
                {t("pwaInstall.step3")}
              </span>
            </div>

            {/* Step 4: Add to Home Screen */}
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-blue-400/20 backdrop-blur-md transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-500/25 border border-blue-400/35 backdrop-blur-md flex items-center justify-center text-blue-200 shrink-0 shadow-inner">
                <PlusSquare className="w-5 h-5 text-blue-200" />
              </div>
              <span className="text-xs font-semibold text-white/95 leading-tight drop-shadow-xs">
                {t("pwaInstall.step4")}
              </span>
            </div>

            {/* Glass Back Button */}
            <button
              type="button"
              onClick={() => setStepView("initial")}
              className={cn(
                "w-full h-11 rounded-2xl mt-3",
                "bg-white/15 hover:bg-white/25 active:bg-white/10 active:scale-98",
                "border border-white/25 backdrop-blur-xl text-white font-bold text-xs sm:text-sm",
                "shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.3)]",
                "flex items-center justify-center gap-2 transition-all cursor-pointer"
              )}
            >
              {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{t("pwaInstall.back")}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
