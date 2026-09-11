"use client";

// Client-side Web Push management — pairs with public/sw.js (worker)
// and src/lib/webPush.ts (server side). Supports multi-device tracking.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// PushManager.subscribe() needs the VAPID public key as a raw Uint8Array,
// not the base64url string env vars hand us.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!PUBLIC_KEY
  );
}

export interface ClientDeviceMetadata {
  platform: "iOS" | "Android" | "Desktop" | "Tablet" | "Unknown";
  browser: string;
  deviceLabel: string;
  userAgent: string;
  isStandalone: boolean;
}

export function getDeviceMetadata(): ClientDeviceMetadata {
  if (typeof window === "undefined") {
    return {
      platform: "Unknown",
      browser: "Unknown",
      deviceLabel: "Unknown Device",
      userAgent: "",
      isStandalone: false,
    };
  }

  const ua = navigator.userAgent || "";
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    (typeof document !== "undefined" && document.referrer.startsWith("android-app://"));

  let platform: "iOS" | "Android" | "Desktop" | "Tablet" | "Unknown" = "Unknown";
  if (/ipad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    platform = "Tablet";
  } else if (/iphone|ipod/i.test(ua)) {
    platform = "iOS";
  } else if (/android/i.test(ua)) {
    platform = /tablet/i.test(ua) ? "Tablet" : "Android";
  } else if (/windows|macintosh|linux|cros/i.test(ua)) {
    platform = "Desktop";
  }

  let browser = "Browser";
  if (/edg/i.test(ua)) {
    browser = "Edge";
  } else if (/samsungbrowser/i.test(ua)) {
    browser = "Samsung Internet";
  } else if (/chrome|crios/i.test(ua)) {
    browser = "Chrome";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = "Safari";
  }

  const modeSuffix = isStandalone ? " PWA" : "";
  const deviceLabel = `${platform} (${browser}${modeSuffix})`;

  return {
    platform,
    browser,
    deviceLabel,
    userAgent: ua,
    isStandalone,
  };
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn("[PushClient] Failed to get existing subscription:", err);
    return null;
  }
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let devId = localStorage.getItem("ug_push_device_id");
    if (!devId) {
      devId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("ug_push_device_id", devId);
    }
    return devId;
  } catch {
    return `dev_${Date.now().toString(36)}`;
  }
}

function isKeyMatching(sub: PushSubscription, publicKeyStr: string): boolean {
  try {
    const rawKey = sub.options?.applicationServerKey;
    if (!rawKey) return false;
    const currentKeyBytes = urlBase64ToUint8Array(publicKeyStr);
    const subKeyBytes = new Uint8Array(rawKey);
    if (subKeyBytes.length !== currentKeyBytes.length) return false;
    for (let i = 0; i < subKeyBytes.length; i++) {
      if (subKeyBytes[i] !== currentKeyBytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Requests notification permission directly via user gesture, creates/retrieves
 * the device's PushSubscription, and registers it with device metadata on the backend.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported() || !PUBLIC_KEY) {
    console.error("[PushClient] Push not supported or VAPID public key missing");
    return false;
  }

  // 1. Direct user gesture permission prompt
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    console.error("[PushClient] Notification.requestPermission error:", err);
    return false;
  }

  if (permission !== "granted") {
    console.warn("[PushClient] Notification permission was not granted:", permission);
    return false;
  }

  // 2. Retrieve Service Worker & PushSubscription
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // If subscription exists but was registered with a different key or is stale, renew it
    if (subscription && !isKeyMatching(subscription, PUBLIC_KEY)) {
      console.log("[PushClient] Existing subscription key mismatch, renewing with current VAPID key...");
      try {
        await subscription.unsubscribe();
      } catch {}
      subscription = null;
    }

    if (!subscription) {
      console.log("[PushClient] Creating fresh PushSubscription via PushManager...");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY) as BufferSource,
      });
    } else {
      console.log("[PushClient] Valid PushSubscription active with current VAPID key...");
    }

    const metadata = getDeviceMetadata();
    const deviceId = getOrCreateDeviceId();
    const payload = {
      ...subscription.toJSON(),
      deviceId,
      platform: metadata.platform,
      browser: metadata.browser,
      deviceLabel: metadata.deviceLabel,
      userAgent: metadata.userAgent,
      isStandalone: metadata.isStandalone,
    };

    // 3. Send subscription with device metadata to server
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[PushClient] Server failed to save subscription:", res.status, errText);
      return false;
    }

    console.log(
      `[PushClient] ✓ Device subscription successfully registered on server (${metadata.deviceLabel})!`
    );
    return true;
  } catch (err) {
    console.error("[PushClient] Error subscribing to push:", err);
    return false;
  }
}

/**
 * Resync an already-granted device subscription with the server without re-prompting.
 */
export async function resyncPushSubscription(): Promise<boolean> {
  if (!isPushSupported() || !PUBLIC_KEY) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription || !isKeyMatching(subscription, PUBLIC_KEY)) {
      // Re-create / renew subscription if missing or mismatched
      return await subscribeToPush();
    }

    const metadata = getDeviceMetadata();
    const deviceId = getOrCreateDeviceId();
    const payload = {
      ...subscription.toJSON(),
      deviceId,
      platform: metadata.platform,
      browser: metadata.browser,
      deviceLabel: metadata.deviceLabel,
      userAgent: metadata.userAgent,
      isStandalone: metadata.isStandalone,
    };

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.warn("[PushClient] Error resyncing push subscription:", err);
    return false;
  }
}

// ── Global Console Diagnostics Helper ───────────────────────────────────────
if (typeof window !== "undefined") {
  (window as unknown as { __pushDiagnostics__?: () => Promise<void> }).__pushDiagnostics__ = async () => {
    const metadata = getDeviceMetadata();

    let sub: PushSubscription | null = null;
    let swReady = false;
    let swController = false;

    if ("serviceWorker" in navigator) {
      swController = !!navigator.serviceWorker.controller;
      try {
        const reg = await navigator.serviceWorker.ready;
        swReady = !!reg;
        if ("PushManager" in window) {
          sub = await reg.pushManager.getSubscription();
        }
      } catch {}
    }

    let backendStatus: Record<string, unknown> = {};
    try {
      const res = await fetch("/api/push/status", { credentials: "same-origin" });
      backendStatus = await res.json();
    } catch {
      backendStatus = { error: "Failed to query /api/push/status" };
    }

    console.group("Nasaq Gym — Multi-Device Web Push Diagnostics");
    console.table({
      "Device Platform": metadata.platform,
      "Browser": metadata.browser,
      "Device Label": metadata.deviceLabel,
      "Standalone (Home Screen)": metadata.isStandalone,
      "Notification API": "Notification" in window,
      "Notification.permission": typeof Notification !== "undefined" ? Notification.permission : "N/A",
      "ServiceWorker in navigator": "serviceWorker" in navigator,
      "ServiceWorker Controller": swController,
      "ServiceWorker Ready": swReady,
      "PushManager in window": "PushManager" in window,
      "VAPID Public Key Loaded": !!PUBLIC_KEY,
      "Device Subscription Exists": !!sub,
      "Endpoint Hostname": sub ? new URL(sub.endpoint).hostname : "None",
      "Backend Total Devices": backendStatus.activeCount ?? "Unknown",
    });
    console.log("Full Backend Status & Registered Devices:", backendStatus);
    console.groupEnd();
  };
}
