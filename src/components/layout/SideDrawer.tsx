"use client";

import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Menu,
  X,
  ShoppingBag,
  ClipboardList,
  Calculator,
  Calendar,
  PackageSearch,
  LogOut,
  ShoppingCart,
  Wallet,
  MessageSquareText,
  LineChart,
  Sun,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { useCart } from "@/lib/CartProvider";
import { fmtCurrency } from "@/lib/format";
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from "@/components/shared/SocialIcons";
import FeedbackDialog from "@/components/shared/FeedbackDialog";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import ThemeSwitch from "@/components/shared/ThemeSwitch";
import { useGymWhatsApp } from "@/hooks/useGymWhatsApp";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMemberGender } from "@/hooks/useMemberGender";

type DrawerItem = {
  key: string;
  href: string;
  icon: LucideIcon;
};

const DRAWER_GROUPS: { items: DrawerItem[] }[] = [
  {
    items: [
      { key: "shop", href: "/shop", icon: ShoppingBag },
      { key: "myOrders", href: "/my-orders", icon: ClipboardList },
    ],
  },
  {
    items: [
      { key: "events", href: "/events", icon: Calendar },
      { key: "lostFound", href: "/lost-and-found", icon: PackageSearch },
    ],
  },
];

export default function SideDrawer({ restricted = false }: { restricted?: boolean }) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const { totalCount, openCart } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const { isFemale } = useMemberGender();
  const { isLinked, openWhatsApp, displayPhone } = useGymWhatsApp();

  const drawerGroups = restricted ? [] : DRAWER_GROUPS;
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | number[] | undefined>(() => {
    const cached = getClientCachedData<any>("/api/members");
    return cached?.balance ?? cached?.data?.balance;
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clientFetch<any>("/api/members", undefined, { ttlMs: 60000 })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data ?? res;
        if (d?.balance !== undefined) setBalance(d.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  const navigate = (href: string) => {
    setOpen(false);
    if (pathname === href) return;
    router.push(href);
  };

  const handleOpenCart = () => {
    setOpen(false);
    openCart();
  };

  const handleOpenFeedback = () => {
    setOpen(false);
    setFeedbackOpen(true);
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        swipeDirection="left"
      >
        <DrawerTrigger
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), "md:hidden cursor-pointer")}
          aria-label={t("nav.drawer")}
        >
          <Menu className="w-5 h-5" />
        </DrawerTrigger>

        <DrawerContent className="max-w-xs h-full inset-y-0 rounded-none border-y-0 flex flex-col p-0 bg-card text-foreground">
          {/* Header */}
          <DrawerHeader className="flex flex-row items-center justify-between px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <Image
                src="/assets/ultra-gym-logo.png"
                alt="Ultra Gym"
                width={2048}
                height={2048}
                className="w-9 h-9 rounded-md"
                priority
              />
              <DrawerTitle className="text-base font-bold tracking-tight">
                <span className="text-foreground">Ultra </span>
                <span className="text-primary">Gym</span>
              </DrawerTitle>
            </div>
            <DrawerClose
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "w-8 h-8 rounded-full text-foreground/70 hover:text-foreground cursor-pointer")}
              aria-label={isAr ? "إغلاق" : "Close"}
            >
              <X className="w-4 h-4" />
            </DrawerClose>
          </DrawerHeader>

          {/* Balance */}
          <div className="mx-3 mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0">
                <Wallet className="w-4 h-4" />
              </span>
              <span className="text-xs font-semibold text-foreground/70">
                {t("home.stats.balance")}
              </span>
            </span>
            <span className="text-lg font-extrabold text-primary tabular-nums">
              {fmtCurrency(balance)}
            </span>
          </div>

          {/* Items */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
            {drawerGroups.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <div className="mx-1 my-2 border-t border-border" />}
                {group.items.map(({ key, href, icon: Icon }) => {
                  const active =
                    pathname === href || pathname.startsWith(href + "/");
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => navigate(href)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-start cursor-pointer w-full",
                        active
                          ? "bg-primary text-primary-foreground font-bold"
                          : "text-foreground/70 hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{t(`nav.${key}`)}</span>
                    </button>
                  );
                })}
              </Fragment>
            ))}

            {!restricted && (
              <button
                type="button"
                onClick={handleOpenCart}
                className="flex items-center gap-3 w-full px-3 py-2.5 mt-auto rounded-xl text-sm font-semibold text-foreground hover:bg-muted/50 transition-all cursor-pointer"
              >
                <span className="w-9 h-9 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-[18px] h-[18px]" />
                </span>
                <span className="flex-1 text-start">{t("cart.title")}</span>
                {totalCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-bold flex items-center justify-center">
                    {totalCount > 99 ? "99+" : totalCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Footer */}
          <div
            className="px-3 pt-3 border-t border-border shrink-0 flex flex-col gap-1 bg-card"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <a
                href="https://www.instagram.com/ultragym.jo/?hl=ar"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ultra Gym on Instagram"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <InstagramIcon className="w-[18px] h-[18px]" />
              </a>
              <a
                href="https://www.facebook.com/UltraGymJo/?locale=ar_AR"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ultra Gym on Facebook"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <FacebookIcon className="w-[18px] h-[18px]" />
              </a>
              {isLinked && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openWhatsApp();
                  }}
                  aria-label={t("whatsapp.contact")}
                  title={displayPhone ? `${t("whatsapp.contact")}: ${displayPhone}` : t("whatsapp.contact")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                >
                  <WhatsAppIcon className="w-[18px] h-[18px]" />
                </button>
              )}
            </div>

            {/* Language Switch */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
              <span className="flex items-center gap-2.5 text-xs font-bold text-foreground/70">
                <Globe className="w-4 h-4 text-primary" />
                <span>{locale === "ar" ? "اللغة" : "Language"}</span>
              </span>
              <LanguageSwitch size="sm" />
            </div>

            {/* Theme Switch */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
              <span className="flex items-center gap-2.5 text-xs font-bold text-foreground/70">
                <Sun className="w-4 h-4 text-primary" />
                <span>{locale === "ar" ? "المظهر" : "Theme"}</span>
              </span>
              <ThemeSwitch size="sm" />
            </div>

            <button
              type="button"
              onClick={handleOpenFeedback}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-semibold text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
            >
              <MessageSquareText className="w-5 h-5 shrink-0" />
              <span>{t("nav.feedback")}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
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
                className="hover:text-primary transition-colors"
              >
                2026 By Nasaq
              </a>
            </p>
          </div>
        </DrawerContent>
      </Drawer>

      {feedbackOpen && (
        <FeedbackDialog open onClose={() => setFeedbackOpen(false)} />
      )}
    </>
  );
}
