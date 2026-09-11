"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useMemberGender } from "@/hooks/useMemberGender";

/**
 * Dynamically updates the browser tab icon (favicon / apple-touch-icon)
 * based on the authenticated member's gender (female vs male).
 * Re-applies icon on every pathname transition to prevent Next.js router
 * from resetting the head links back to server defaults.
 */
export default function DynamicFavicon() {
  const { isFemale } = useMemberGender();
  const pathname = usePathname();

  useEffect(() => {
    const iconPath = isFemale
      ? "/icons/badge-female-monochrome.png?v=fb_7"
      : "/icons/badge-monochrome.png?v=mb_7";

    const updateFavicon = () => {
      // 1. Update all existing icon link tags in document head
      const links = document.querySelectorAll<HTMLLinkElement>(
        "link[rel*='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
      );

      if (links.length > 0) {
        links.forEach((link) => {
          if (link.href !== iconPath && !link.href.endsWith(iconPath)) {
            link.href = iconPath;
          }
        });
      }

      // 2. Ensure dynamic-favicon link exists
      let dynamicLink = document.getElementById("dynamic-favicon") as HTMLLinkElement | null;
      if (!dynamicLink) {
        dynamicLink = document.createElement("link");
        dynamicLink.id = "dynamic-favicon";
        dynamicLink.rel = "icon";
        dynamicLink.type = "image/png";
        document.head.appendChild(dynamicLink);
      }
      if (dynamicLink.href !== iconPath) {
        dynamicLink.href = iconPath;
      }
    };

    updateFavicon();

    // Small timeout to catch post-hydration Next.js head reconciliation
    const timer = setTimeout(updateFavicon, 150);
    return () => clearTimeout(timer);
  }, [isFemale, pathname]);

  return null;
}
