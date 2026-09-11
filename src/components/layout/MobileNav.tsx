"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Apple,
  Dumbbell,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";

const NAV_ITEMS = [
  { key: "home", href: "/home", icon: LayoutDashboard },
  { key: "nutrition", href: "/nutrition", icon: Apple },
  { key: "workouts", href: "/workouts", icon: Dumbbell },
  { key: "profile", href: "/profile", icon: User },
] as const;

function NavItem({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1 min-w-[40px] transition-colors select-none",
        active ? "text-primary" : "text-foreground/70 hover:text-foreground"
      )}
    >
      <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 2} />
      {active && (
        <span className="text-3xs font-bold leading-none whitespace-nowrap">
          {label}
        </span>
      )}
    </Link>
  );
}

export default function MobileNav({ restricted = false }: { restricted?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navItems = restricted ? NAV_ITEMS.filter((i) => i.key === "home") : NAV_ITEMS;

  return (
    <nav
      className="md:hidden fixed inset-x-0 z-50 flex justify-center pointer-events-none"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div className="pointer-events-auto flex items-center gap-7 rounded-full border border-border bg-card/90 px-7 py-3.5 shadow-2xl backdrop-blur-md">
        {navItems.map((item) => (
          <NavItem
            key={item.key}
            href={item.href}
            icon={item.icon}
            label={t(`nav.${item.key}`)}
            active={isActive(item.href)}
          />
        ))}
      </div>
    </nav>
  );
}
