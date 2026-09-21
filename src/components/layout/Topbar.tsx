"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";
import { useCart } from "@/lib/CartProvider";
import NotificationBell from "@/components/shared/NotificationBell";
import SideDrawer from "./SideDrawer";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/shared/BrandLogo";

export default function Topbar({
  restricted = false,
}: {
  restricted?: boolean;
}) {
  const { t } = useI18n();
  const { totalCount, openCart } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xs border-b border-border">
      <div className="flex items-center justify-between px-4 md:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {/* Mobile: hamburger + BrandLogo */}
        <div className="flex items-center gap-2.5 md:hidden">
          <SideDrawer restricted={restricted} />
          <Link href="/home" className="hover:opacity-90 transition-opacity">
            <BrandLogo size="xs" variant="full" />
          </Link>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 md:ms-auto">
          {/* Notification bell */}
          <NotificationBell />

          {/* Cart — Desktop version */}
          {!restricted && (
            <Button
              variant="outline"
              size="sm"
              onClick={openCart}
              aria-label={t("cart.title")}
              className="hidden md:relative md:flex items-center gap-1.5 h-9"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">{t("cart.title")}</span>
              {totalCount > 0 && (
                <span className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-3xs font-bold flex items-center justify-center">
                  {totalCount > 99 ? "99+" : totalCount}
                </span>
              )}
            </Button>
          )}

          {/* Cart — mobile only icon-button shortcut */}
          {!restricted && (
            <Button
              variant="secondary"
              size="icon"
              onClick={openCart}
              aria-label={t("cart.title")}
              className="md:hidden relative rounded-full w-9 h-9 text-primary bg-primary/10 hover:bg-primary/20"
            >
              <ShoppingCart className="w-4 h-4" />
              {totalCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {totalCount > 99 ? "99+" : totalCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
