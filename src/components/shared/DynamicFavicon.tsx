"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useMemberGender } from "@/hooks/useMemberGender";

/**
 * Ensures browser tab icon and PWA assets always reflect the authentic
 * Nasaq Gym branding. Prevents stale icon caching across navigation transitions.
 */
export default function DynamicFavicon() {
  const { isFemale } = useMemberGender();
  const pathname = usePathname();

  useEffect(() => {
    const faviconPath = isFemale
      ? "/icon-female-192.png?v=nasq_2"
      : "/icon-192.png?v=nasq_2";

    const updateFavicon = () => {
      try {
        let dynamicLink = document.getElementById("dynamic-favicon") as HTMLLinkElement | null;
        if (dynamicLink && (dynamicLink.href === faviconPath || dynamicLink.href.endsWith(faviconPath))) {
          return;
        }

        // Update favicon links without touching apple-touch-icon
        const faviconLinks = document.querySelectorAll<HTMLLinkElement>(
          "link[rel='icon'], link[rel='shortcut icon']"
        );

        if (faviconLinks.length > 0) {
          faviconLinks.forEach((link) => {
            if (link.href !== faviconPath && !link.href.endsWith(faviconPath)) {
              link.href = faviconPath;
            }
          });
        }

        // Ensure apple-touch-icon is consistently pointing to valid high-res icon
        const appleTouchLinks = document.querySelectorAll<HTMLLinkElement>(
          "link[rel='apple-touch-icon']"
        );
        appleTouchLinks.forEach((link) => {
          const applePath = "/apple-touch-icon.png?v=nasq_2";
          if (!link.href.endsWith(applePath)) {
            link.href = applePath;
          }
        });

        // Ensure dynamic-favicon link exists
        if (!dynamicLink) {
          dynamicLink = document.createElement("link");
          dynamicLink.id = "dynamic-favicon";
          dynamicLink.rel = "icon";
          dynamicLink.type = "image/png";
          document.head.appendChild(dynamicLink);
        }
        if (dynamicLink.href !== faviconPath) {
          dynamicLink.href = faviconPath;
        }
      } catch {}
    };

    updateFavicon();
    const timer = setTimeout(updateFavicon, 150);
    return () => clearTimeout(timer);
  }, [isFemale, pathname]);

  return null;
}
