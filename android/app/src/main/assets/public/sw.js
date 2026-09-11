// Production Web Push service worker — Ultra Gym
// Handles incoming push events, Android status bar branding, and authenticated per-device telemetry.
// See src/lib/webPush.ts for server side, src/lib/pushReceiptCrypto.ts for token authorization.

// ── Lifecycle ───────────────────────────────────────────────────────────
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper for telemetry receipt (fire & forget, non-blocking)
function sendTelemetryReceipt(stage, data) {
  try {
    if (!data?.deliveryId) return;

    const payload = {
      stage, // "received" | "display_requested" | "clicked"
      deliveryId: data.deliveryId,
      receiptToken: data.receiptToken,
      notificationId: data.notificationId,
      deviceId: data.deviceId,
      clientTimestamp: new Date().toISOString(),
    };

    fetch("/api/push/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Non-fatal telemetry — never block UI or notification display
    });
  } catch {}
}

// ── Push Event (Foreground / Background / Closed) ───────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Ultra Gym",
      body: event.data ? event.data.text() : "لديك إشعار جديد من Ultra Gym",
    };
  }

  const title = data.title || "Ultra Gym";
  const notificationId =
    data.notificationId || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const deliveryId = data.deliveryId || `del_${notificationId}`;
  const receiptToken = data.receiptToken || "";
  const deviceId = data.deviceId || "unknown";

  // 1. Send immediate "received" telemetry with cryptographic receipt token
  sendTelemetryReceipt("received", { notificationId, deliveryId, receiptToken, deviceId });

  // Resolve absolute URLs for assets
  const origin = self.location.origin;
  const iconUrl = data.icon ? new URL(data.icon, origin).href : new URL("/icon-192.png", origin).href;
  const badgeUrl = data.badge ? new URL(data.badge, origin).href : new URL("/icons/badge-monochrome.png", origin).href;

  const options = {
    body: data.body || "لديك إشعار جديد من Ultra Gym",
    icon: iconUrl,
    badge: badgeUrl,
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    tag: data.tag || `ug_${notificationId}`,
    renotify: true,
    data: {
      url: data.url || "/home",
      notificationId,
      deliveryId,
      receiptToken,
      deviceId,
      type: data.type,
      receivedAt: Date.now(),
    },
    timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
  };

  if (data.image) {
    try {
      options.image = new URL(data.image, origin).href;
    } catch {}
  }

  if (Array.isArray(data.actions) && data.actions.length > 0) {
    const validActions = data.actions.filter(
      (a) => a && typeof a.action === "string" && typeof a.title === "string" && a.title.trim().length > 0
    );
    if (validActions.length > 0) {
      options.actions = validActions;
    }
  }

  // 2. Mandatory OS-level user notification with fallback guarantee
  const showPromise = self.registration
    .showNotification(title, options)
    .then(() => {
      sendTelemetryReceipt("display_requested", { notificationId, deliveryId, receiptToken, deviceId });
    })
    .catch((err) => {
      console.warn("[SW] showNotification full options error, retrying basic fallback:", err);
      return self.registration
        .showNotification(title, {
          body: data.body || "لديك إشعار جديد من Ultra Gym",
          icon: iconUrl,
          data: options.data,
        })
        .then(() => {
          sendTelemetryReceipt("display_requested", { notificationId, deliveryId, receiptToken, deviceId });
        })
        .catch((fallbackErr) => {
          console.error("[SW] Fatal showNotification fallback error:", fallbackErr);
        });
    });

  event.waitUntil(showPromise);
});

// ── Notification Click ──────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const notificationId = notifData.notificationId;
  const deliveryId = notifData.deliveryId;
  const receiptToken = notifData.receiptToken;
  const deviceId = notifData.deviceId;

  // Send "clicked" telemetry with cryptographic receipt token
  sendTelemetryReceipt("clicked", { notificationId, deliveryId, receiptToken, deviceId });

  const actionUrl =
    event.action && notifData.actions
      ? (notifData.actions.find((a) => a.action === event.action) || {}).url
      : null;
  const targetUrl = actionUrl || notifData.url || "/home";
  const resolvedUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin && "focus" in client) {
            if ("navigate" in client) {
              return client.navigate(resolvedUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedUrl);
        }
      })
  );
});
