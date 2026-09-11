"use client";

import { useEffect } from "react";

// Registers the Web Push service worker once per app load and automatically
// resyncs the active device subscription with the backend if permission is granted.
// Ensures that second devices (like partner's iPhone B) are instantly registered
// upon opening the app without needing manual toggles.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async () => {
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const { resyncPushSubscription } = await import("@/lib/pushClient");
            await resyncPushSubscription();
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
