"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Apple,
  Dumbbell,
  ShoppingBag,
  Calendar,
  User,
  LogOut,
  PackageSearch,
  Calculator,
  ClipboardList,
  MessageSquareText,
  LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/shared/SocialIcons";
import FeedbackDialog from "@/components/shared/FeedbackDialog";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import ThemeSwitch from "@/components/shared/ThemeSwitch";
import { useMemberGender } from "@/hooks/useMemberGender";
import { useGymWhatsApp } from "@/hooks/useGymWhatsApp";
import BrandLogo from "@/components/shared/BrandLogo";

const NAV_ITEMS = [
  { key: "home", href: "/home", icon: LayoutDashboard },
  { key: "nutrition", href: "/nutrition", icon: Apple },
  { key: "shop", href: "/shop", icon: ShoppingBag },
  { key: "myOrders", href: "/my-orders", icon: ClipboardList },
  { key: "workouts", href: "/workouts", icon: Dumbbell },
  { key: "events", href: "/events", icon: Calendar },
  { key: "lostFound", href: "/lost-and-found", icon: PackageSearch },
  { key: "profile", href: "/profile", icon: User },
] as const;

export default function Sidebar({ restricted = false }: { restricted?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isFemale } = useMemberGender();
  const { isLinked, openWhatsApp, displayPhone } = useGymWhatsApp();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navItems = restricted ? NAV_ITEMS.filter((i) => i.key === "home") : NAV_ITEMS;

  const handleLogout = async () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        localStorage.removeItem("ip_tracked");
        localStorage.removeItem("ug_gender");
        localStorage.removeItem("ug_gender_raw");
      }
    } catch {}
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-sidebar border-l border-sidebar-border p-4 gap-2 text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center px-2 py-3 mb-3">
        <Link href="/home" className="hover:opacity-90 transition-opacity">
          <BrandLogo size="md" showSubtext subtext="نسق جيم الرياضي" />
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
        {navItems.map(({ key, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-bold"
                  : "text-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{t(`nav.${key}`)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Social & Dynamic WhatsApp */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-1.5">
        <a
          href="https://www.instagram.com/ultragym.jo/?hl=ar"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-sidebar-primary hover:bg-sidebar-primary/10 transition-colors"
        >
          <InstagramIcon className="w-[18px] h-[18px]" />
        </a>
        <a
          href="https://www.facebook.com/UltraGymJo/?locale=ar_AR"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-sidebar-primary hover:bg-sidebar-primary/10 transition-colors"
        >
          <FacebookIcon className="w-[18px] h-[18px]" />
        </a>
        {isLinked && (
          <button
            type="button"
            onClick={() => openWhatsApp()}
            aria-label={t("whatsapp.contact")}
            title={displayPhone ? `${t("whatsapp.contact")}: ${displayPhone}` : t("whatsapp.contact")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <WhatsAppIcon className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {/* Language & Theme Controls */}
      <div className="flex items-center justify-between gap-1.5 px-1 py-1">
        <LanguageSwitch size="sm" />
        <ThemeSwitch size="sm" />
      </div>

      {/* Feedback */}
      <button
        type="button"
        onClick={() => setFeedbackOpen(true)}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all cursor-pointer"
      >
        <MessageSquareText className="w-5 h-5" />
        <span>{t("nav.feedback")}</span>
      </button>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
      >
        <LogOut className="w-5 h-5" />
        <span>{t("nav.logout")}</span>
      </button>

      <p className="text-center text-2xs text-foreground/70 pt-2">
        ©{" "}
        <a
          href="https://nasaqjo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-sidebar-primary transition-colors"
        >
          2026 By Nasaq
        </a>
      </p>

      {feedbackOpen && (
        <FeedbackDialog open onClose={() => setFeedbackOpen(false)} />
      )}
    </aside>
  );
}
