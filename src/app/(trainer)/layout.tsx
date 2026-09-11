"use client";

import { Users, CalendarClock, ClipboardList, User } from "lucide-react";
import PortalShell, { type PortalNavItem } from "@/components/layout/PortalShell";

const NAV_ITEMS: PortalNavItem[] = [
  { href: "/trainer", labelKey: "trainer.nav.trainees", icon: Users },
  { href: "/trainer/sessions", labelKey: "trainer.nav.sessions", icon: CalendarClock },
  { href: "/trainer/templates", labelKey: "trainer.nav.templates", icon: ClipboardList },
  { href: "/trainer/profile", labelKey: "trainer.nav.profile", icon: User },
];

export default function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell navItems={NAV_ITEMS} portalTitleKey="trainer.portalTitle" role="trainer">
      {children}
    </PortalShell>
  );
}
