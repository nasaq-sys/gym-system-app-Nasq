"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LogOut,
  Repeat,
  Globe,
  Sun,
  MessageSquareText,
  User,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { FacebookIcon, InstagramIcon } from "@/components/shared/SocialIcons";
import FeedbackDialog from "@/components/shared/FeedbackDialog";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import ThemeSwitch from "@/components/shared/ThemeSwitch";
import type { SessionRole } from "@/lib/auth";
import { clientFetch } from "@/lib/clientCache";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BrandLogo from "@/components/shared/BrandLogo";

export interface PortalNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

export default function PortalShell({
  children,
  navItems,
  portalTitleKey,
  role,
}: {
  children: ReactNode;
  navItems: PortalNavItem[];
  portalTitleKey: string;
  role: SessionRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const isTrainer = role === "trainer";

  const [name, setName] = useState<string | undefined>();
  const [altRole, setAltRole] = useState<SessionRole | undefined>();
  const [switching, setSwitching] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `Nasaq Gym - ${t(portalTitleKey)}`;
    }
  }, [t, portalTitleKey]);

  useEffect(() => {
    let cancelled = false;

    const check = (isRetry: boolean) => {
      clientFetch<any>("/api/auth/me", undefined, { ttlMs: 30000 })
        .then((session) => {
          if (cancelled || !session) return;
          if (session.role !== role) {
            const home: Record<SessionRole, string> = {
              admin: "/home",
              trainer: "/trainer",
              member: "/home",
            };
            router.replace(home[session.role as SessionRole] || "/home");
            return;
          }
          setName(session.name);
          setAltRole(session.altRole);

          try {
            if (typeof window !== "undefined" && !localStorage.getItem("ip_tracked")) {
              fetch("/api/track-ip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                  recordId: session.recordId || session.memberId,
                  userRole: session.role,
                }),
              })
                .then((r) => {
                  if (r.ok) localStorage.setItem("ip_tracked", "true");
                })
                .catch(() => {});
            }
          } catch {}
        })
        .catch(() => {
          if (cancelled) return;
          if (!isRetry) {
            window.setTimeout(() => check(true), 1500);
          }
        });
    };

    check(false);
    return () => {
      cancelled = true;
    };
  }, [router, role]);

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        localStorage.removeItem("ip_tracked");
      }
    } catch {}
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  const handleSwitchRole = async () => {
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", { method: "POST" });
      if (!res.ok) return;
      const json = await res.json();
      const home: Record<SessionRole, string> = {
        admin: "/home",
        trainer: "/trainer",
        member: "/home",
      };
      window.location.href = home[json?.data?.role as SessionRole] || "/";
    } finally {
      setSwitching(false);
    }
  };

  const switchLabel =
    altRole === "admin"
      ? t("portal.switchToAdmin")
      : altRole === "trainer"
        ? t("portal.switchToTrainer")
        : "";

  const roleBadgeLabel =
    role === "trainer"
      ? isAr ? "مدرب معتمد" : "Certified Trainer"
      : isAr ? "إدارة النادي" : "Management";

  const isActive = (href: string) => {
    if (href === "/trainer") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* 💻 Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-sidebar border-l border-sidebar-border p-4 gap-2 text-sidebar-foreground">
        <div className="flex items-center px-2 py-3 mb-2">
          <BrandLogo size="md" showSubtext subtext={roleBadgeLabel} />
        </div>

        {/* User Card */}
        <div className="mx-1 mb-2 p-3 rounded-2xl bg-sidebar-accent/50 border border-sidebar-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary/15 text-sidebar-primary flex items-center justify-center font-bold text-sm shrink-0">
            {name ? name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-sidebar-foreground truncate">{name || t(portalTitleKey)}</p>
            <p className="text-3xs text-sidebar-primary font-semibold truncate">{roleBadgeLabel}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {navItems.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                isActive(href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold"
                  : "text-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
        </nav>

        {altRole && (
          <Button
            variant="ghost"
            onClick={handleSwitchRole}
            disabled={switching}
            className="justify-start gap-3 text-sidebar-primary hover:bg-sidebar-primary/10 hover:text-sidebar-primary"
          >
            <Repeat className="w-4 h-4 shrink-0" />
            <span>{switching ? t("portal.switching") : switchLabel}</span>
          </Button>
        )}

        {/* Social */}
        <div className="flex items-center justify-center gap-1 px-3 py-1">
          <a
            href="https://www.instagram.com/ultragym.jo/?hl=ar"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-foreground/70 hover:text-sidebar-primary hover:bg-sidebar-primary/10 transition-colors"
          >
            <InstagramIcon className="w-4 h-4" />
          </a>
          <a
            href="https://www.facebook.com/UltraGymJo/?locale=ar_AR"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-foreground/70 hover:text-sidebar-primary hover:bg-sidebar-primary/10 transition-colors"
          >
            <FacebookIcon className="w-4 h-4" />
          </a>
        </div>

        {!isTrainer && (
          <div className="flex items-center justify-between gap-1.5 px-1 py-1">
            <LanguageSwitch size="sm" />
            <ThemeSwitch size="sm" />
          </div>
        )}

        {/* Feedback */}
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all cursor-pointer"
        >
          <MessageSquareText className="w-5 h-5 shrink-0" />
          <span>{t("nav.feedback")}</span>
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>{t("nav.logout")}</span>
        </button>

        <p className="text-center text-2xs text-foreground/70 pt-1">
          ©{" "}
          <a
            href="https://nasaqjo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sidebar-primary transition-colors font-medium"
          >
            2026 By Nasaq
          </a>
        </p>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between px-4 lg:px-6 py-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] gap-3">
            {/* Mobile Header Brand */}
            <div className="flex items-center gap-2.5 lg:hidden min-w-0">
              {!isTrainer && (
                <Drawer
                  open={drawerOpen}
                  onOpenChange={setDrawerOpen}
                  swipeDirection="left"
                >
                  <DrawerTrigger
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), "w-9 h-9 cursor-pointer")}
                    aria-label={isAr ? "القائمة الجانبية" : "Open Drawer"}
                  >
                    <Menu className="w-5 h-5" />
                  </DrawerTrigger>
                  <DrawerContent className="max-w-xs h-full inset-y-0 rounded-none border-y-0 flex flex-col p-0 bg-card text-foreground">
                    <DrawerHeader className="flex flex-row items-center justify-between px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-border shrink-0">
                      <div className="flex items-center gap-2.5">
                        <DrawerTitle className="sr-only">Nasaq Gym</DrawerTitle>
                        <BrandLogo size="sm" showSubtext subtext={roleBadgeLabel} />
                      </div>
                      <DrawerClose
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "w-8 h-8 rounded-full cursor-pointer")}
                        aria-label={isAr ? "إغلاق" : "Close"}
                      >
                        <X className="w-4 h-4" />
                      </DrawerClose>
                    </DrawerHeader>

                    {/* Profile Card in Drawer */}
                    <div className="mx-4 mt-3.5 p-3.5 rounded-2xl bg-muted/40 border border-border/80 flex items-center gap-3 shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-black text-sm shrink-0">
                        {name ? name.slice(0, 2).toUpperCase() : <ShieldCheck className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate">{name || t(portalTitleKey)}</p>
                        <Badge variant="outline" className="text-3xs text-emerald-400 font-semibold border-emerald-500/30 bg-emerald-500/10 mt-0.5">
                          {isAr ? "متصل باللوحة" : "Active Portal"}
                        </Badge>
                      </div>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 overflow-y-auto px-3 py-3.5 flex flex-col gap-1.5">
                      {navItems.map(({ href, labelKey, icon: Icon }) => {
                        const active = isActive(href);
                        return (
                          <button
                            key={href}
                            type="button"
                            onClick={() => {
                              setDrawerOpen(false);
                              router.push(href);
                            }}
                            className={cn(
                              "flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-bold transition-all text-start cursor-pointer w-full",
                              active
                                ? "bg-primary text-primary-foreground font-bold"
                                : "text-foreground/70 hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            <Icon className="w-5 h-5 shrink-0" />
                            <span>{t(labelKey)}</span>
                          </button>
                        );
                      })}

                      {altRole && (
                        <Button
                          variant="secondary"
                          onClick={handleSwitchRole}
                          disabled={switching}
                          className="mt-2 justify-start gap-3 w-full"
                        >
                          <Repeat className="w-4 h-4 shrink-0" />
                          <span>{switching ? t("portal.switching") : switchLabel}</span>
                        </Button>
                      )}
                    </nav>

                    {/* Drawer Footer Controls */}
                    <div
                      className="px-3 pt-3 border-t border-border shrink-0 flex flex-col gap-2 bg-card"
                      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
                    >
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
                        <span className="flex items-center gap-2 text-xs font-bold text-foreground/70">
                          <Globe className="w-4 h-4 text-primary" />
                          <span>{isAr ? "اللغة" : "Language"}</span>
                        </span>
                        <LanguageSwitch size="sm" />
                      </div>

                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
                        <span className="flex items-center gap-2 text-xs font-bold text-foreground/70">
                          <Sun className="w-4 h-4 text-primary" />
                          <span>{isAr ? "المظهر" : "Theme"}</span>
                        </span>
                        <ThemeSwitch size="sm" />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false);
                          setFeedbackOpen(true);
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
                      >
                        <MessageSquareText className="w-4 h-4 shrink-0" />
                        <span>{t("nav.feedback")}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>{t("nav.logout")}</span>
                      </button>
                    </div>
                  </DrawerContent>
                </Drawer>
              )}

              <div className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0">
                  <span className="text-sm font-black text-foreground tracking-tight truncate block">
                    Nasaq Gym
                  </span>
                  <span className="text-3xs text-primary font-semibold truncate block">
                    {name || roleBadgeLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Desktop: Page Title */}
            <div className="hidden lg:block">
              <h2 className="text-base font-bold text-foreground">
                {name || t(portalTitleKey)}
              </h2>
            </div>

            {/* Topbar Action Controls */}
            <div className="flex items-center gap-2">
              {altRole && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSwitchRole}
                  disabled={switching}
                  className="gap-1.5 h-8 text-xs font-bold"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{switchLabel}</span>
                </Button>
              )}
              {!isTrainer && <LanguageSwitch size="sm" />}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main
          className={cn(
            "flex-1 p-4 md:p-6 animate-fade-in",
            isTrainer ? "pb-28 lg:pb-12" : "pb-12"
          )}
        >
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* 📱 Trainer Mobile Bottom Navigation Bar */}
      {isTrainer && (
        <nav
          className="lg:hidden fixed inset-x-0 z-30 flex justify-center pointer-events-none"
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
          aria-label="Trainer Navigation"
        >
          <div className="pointer-events-auto flex items-center gap-6 rounded-full border border-border bg-card/90 px-6 py-3 shadow-2xl backdrop-blur-md">
            {navItems.map(({ href, labelKey, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 min-w-[44px] transition-colors select-none",
                    active ? "text-primary" : "text-foreground/70 hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                  {active && (
                    <span className="text-3xs font-bold leading-none whitespace-nowrap">
                      {t(labelKey)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Feedback Dialog */}
      {feedbackOpen && (
        <FeedbackDialog open onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  );
}
