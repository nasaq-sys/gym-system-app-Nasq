import webpush from "web-push";
import { getRecordById, updateRecord } from "@/lib/airtable";
import { TABLES, MEMBER_FIELDS, TRAINER_FIELDS } from "@/lib/constants";
import { getFromRedis, setInRedis } from "@/lib/redisClient";
import { generateReceiptToken } from "@/lib/pushReceiptCrypto";

// Production Web Push Infrastructure for Ultra Gym
// Handles multi-device fan-out, per-device delivery records, retry resilience,
// telemetry stages (Provider Accepted → Device Received → Display Requested → Clicked).

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:support@ultragym.jo";

let configured = false;
export function ensureVapidConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey) {
    console.warn("[WebPush] VAPID keys missing in environment variables!");
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
  } catch (err) {
    console.error("[WebPush] Error setting VAPID details:", err);
    return false;
  }
}

export type DevicePlatform = "iOS" | "Android" | "Desktop" | "Tablet" | "Unknown";

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceId?: string;
  platform?: DevicePlatform;
  browser?: string;
  deviceLabel?: string;
  userAgent?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  lastPushAttemptAt?: string;
  lastProviderAcceptedAt?: string;
  lastDeviceReceiptAt?: string;
  lastDisplayRequestedAt?: string;
  lastClickedAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastFailureStatus?: number;
  lastFailureError?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
  icon?: string;
  badge?: string;
  sound?: string;
  timestamp?: string;
  notificationId?: string;
  type?: string;
  gender?: string;
  actions?: Array<{ action: string; title: string; url?: string }>;
}

export type DeliveryStatus =
  | "pending"
  | "provider_accepted"
  | "device_received"
  | "display_requested"
  | "clicked"
  | "failed";

export interface NotificationDeliveryRecord {
  deliveryId: string;
  notificationId: string;
  userId: string;
  userName?: string;
  deviceId: string;
  platform: DevicePlatform;
  provider: string;
  deviceLabel: string;
  endpointHostname: string;
  endpointFingerprint: string;
  endpoint?: string;
  status: DeliveryStatus;
  statusCode?: number;
  providerAcceptedAt?: string;
  deviceReceivedAt?: string;
  displayRequestedAt?: string;
  clickedAt?: string;
  failedAt?: string;
  failureReason?: string;
  attemptedAt: string;
}

export interface NotificationSummaryRecord {
  notificationId: string;
  title: string;
  body: string;
  url: string;
  destinationLabel: string;
  sentAt: string;
  recipientCount: number;
  deviceCount: number;
  providerAcceptedCount: number;
  deviceReceivedCount: number;
  displayRequestedCount: number;
  clickedCount: number;
  failedCount: number;
  pendingCount: number;
  deliveries: NotificationDeliveryRecord[];
}

export interface DevicePushResult {
  deliveryId?: string;
  deviceId?: string;
  endpointHostname: string;
  endpointFingerprint: string;
  platform: DevicePlatform;
  provider: string;
  deviceLabel?: string;
  statusCode?: number;
  success: boolean;
  error?: string;
  retries?: number;
  attemptedAt: string;
}

export interface SendPushResult {
  userId: string;
  notificationId?: string;
  subscriptionsFound: number;
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
  devices: DevicePushResult[];
  // Backwards compatibility for existing legacy imports
  total: number;
  details: Array<{
    endpointHostname: string;
    statusCode?: number;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkSendPushResult {
  notificationId: string;
  recipientCount: number;
  deviceCount: number;
  sent: number;
  failed: number;
  dead: number;
  deliveries: NotificationDeliveryRecord[];
}

function parseSubscriptions(raw: unknown): PushSubscriptionJSON[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PushSubscriptionJSON =>
        Boolean(item && typeof item === "object" && typeof item.endpoint === "string" && item.keys)
    );
  } catch {
    return [];
  }
}

export function getEndpointHostname(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return endpoint.slice(0, 30);
  }
}

export function getEndpointFingerprint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    const path = url.pathname;
    const tokenTail = path.length > 8 ? path.slice(-6) : endpoint.slice(-6);
    return `${host} (..${tokenTail})`;
  } catch {
    return endpoint.slice(0, 24);
  }
}

export function inferPlatformAndProvider(
  endpoint: string,
  userAgent?: string,
  clientPlatform?: DevicePlatform
): { platform: DevicePlatform; provider: string } {
  const host = getEndpointHostname(endpoint).toLowerCase();
  const ua = userAgent || "";

  let provider = "Web Push";
  if (host.includes("apple.com")) {
    provider = "Apple Web Push";
  } else if (host.includes("googleapis.com") || host.includes("google.com")) {
    provider = "Google FCM";
  } else if (host.includes("mozilla.com") || host.includes("mozilla.org")) {
    provider = "Mozilla Push";
  } else if (host.includes("windows.com") || host.includes("microsoft.com")) {
    provider = "Microsoft WNS";
  }

  let platform: DevicePlatform = clientPlatform || "Unknown";
  if (platform === "Unknown") {
    if (/iphone|ipad|ipod/i.test(ua) || host.includes("apple.com")) {
      platform = /ipad/i.test(ua) ? "Tablet" : "iOS";
    } else if (/android/i.test(ua)) {
      platform = /tablet/i.test(ua) ? "Tablet" : "Android";
    } else if (/windows|macintosh|linux|cros/i.test(ua)) {
      platform = "Desktop";
    }
  }

  return { platform, provider };
}

/**
 * Retrieve all active push subscriptions for any user ID across Redis & Airtable.
 */
export async function getUserSubscriptions(
  userId: string,
  role?: string
): Promise<PushSubscriptionJSON[]> {
  if (!userId) return [];

  const cacheKey = `push_subs:${userId}`;
  const cached = await getFromRedis<PushSubscriptionJSON[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  let subs: PushSubscriptionJSON[] = [];

  try {
    if (!role || role === "member") {
      const record = await getRecordById(TABLES.MEMBERS, userId);
      if (record?.fields) {
        subs = parseSubscriptions(record.fields[MEMBER_FIELDS.PUSH_SUBSCRIPTIONS]);
      }
    }
  } catch {}

  if (subs.length === 0 && role === "trainer") {
    try {
      const record = await getRecordById(TABLES.TRAINERS, userId);
      if (record?.fields) {
        subs = parseSubscriptions(record.fields[TRAINER_FIELDS.PUSH_SUBSCRIPTIONS]);
      }
    } catch {}
  }

  if (subs.length > 0) {
    await setInRedis(cacheKey, subs, 30 * 86400);
  }

  return subs;
}

/**
 * Save / update push subscription for a user across Airtable & Redis.
 * Retains every unique device endpoint without overwriting other devices.
 */
export async function saveUserSubscription(
  userId: string,
  subscription: PushSubscriptionJSON,
  role?: string
): Promise<void> {
  if (!userId || !subscription?.endpoint || !subscription?.keys) return;

  const now = new Date().toISOString();
  const { platform, provider } = inferPlatformAndProvider(
    subscription.endpoint,
    subscription.userAgent,
    subscription.platform
  );

  const deviceId =
    subscription.deviceId ||
    `dev_${platform.toLowerCase()}_${getEndpointFingerprint(subscription.endpoint).slice(-6)}`;

  const subToSave: PushSubscriptionJSON = {
    ...subscription,
    deviceId,
    platform: subscription.platform || platform,
    browser: subscription.browser || "Browser",
    deviceLabel: subscription.deviceLabel || `${platform} (${provider})`,
    active: true,
    updatedAt: now,
    createdAt: subscription.createdAt || now,
    lastSeenAt: now,
  };

  const existing = await getUserSubscriptions(userId, role);
  const next = [
    ...existing.filter((s) => s.endpoint !== subscription.endpoint),
    subToSave,
  ];

  // 1. Update Redis cache immediately
  const cacheKey = `push_subs:${userId}`;
  await setInRedis(cacheKey, next, 30 * 86400);

  // 2. Persist to Airtable
  try {
    if (!role || role === "member") {
      await updateRecord(TABLES.MEMBERS, userId, {
        [MEMBER_FIELDS.PUSH_SUBSCRIPTIONS]: JSON.stringify(next),
      });
    } else if (role === "trainer") {
      await updateRecord(TABLES.TRAINERS, userId, {
        [TRAINER_FIELDS.PUSH_SUBSCRIPTIONS]: JSON.stringify(next),
      });
    }
  } catch (err) {
    console.warn(`[WebPush] Could not write to Airtable table for ${userId}:`, err);
  }

  console.log(
    `[WebPush] Saved subscription for user ${userId} [${subToSave.deviceLabel} - ${getEndpointFingerprint(subscription.endpoint)}]. Total active devices: ${next.length}`
  );
}

/**
 * Remove an invalid or uninstalled push subscription endpoint.
 * Only removes the targeted endpoint, keeping all other registered devices intact.
 */
export async function removeUserSubscription(
  userId: string,
  endpoint: string,
  role?: string
): Promise<void> {
  if (!userId || !endpoint) return;

  const existing = await getUserSubscriptions(userId, role);
  const next = existing.filter((s) => s.endpoint !== endpoint);

  // Update Redis
  const cacheKey = `push_subs:${userId}`;
  await setInRedis(cacheKey, next, 30 * 86400);

  // Update Airtable
  try {
    if (!role || role === "member") {
      await updateRecord(TABLES.MEMBERS, userId, {
        [MEMBER_FIELDS.PUSH_SUBSCRIPTIONS]: JSON.stringify(next),
      });
    } else if (role === "trainer") {
      await updateRecord(TABLES.TRAINERS, userId, {
        [TRAINER_FIELDS.PUSH_SUBSCRIPTIONS]: JSON.stringify(next),
      });
    }
  } catch {}

  console.log(
    `[WebPush] Pruned dead/uninstalled endpoint for user ${userId} (${getEndpointFingerprint(endpoint)}). Remaining devices: ${next.length}`
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a push notification to a single subscription with controlled exponential retry
 * for transient errors (429, 500, 502, 503, timeout). Does NOT retry 404 / 410.
 */
async function sendNotificationWithRetry(
  sub: PushSubscriptionJSON,
  body: string,
  pushOptions: { TTL: number; urgency: "high" },
  maxRetries = 2
): Promise<{ statusCode?: number; success: boolean; error?: string; retries: number; isDead: boolean }> {
  let retries = 0;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const sendResponse = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        body,
        pushOptions
      );

      return {
        statusCode: sendResponse.statusCode,
        success: true,
        retries,
        isDead: false,
      };
    } catch (err: unknown) {
      lastErr = err;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const errMsg = (err as { message?: string })?.message || String(err);

      // Permanent failures — do NOT retry
      if (statusCode === 404 || statusCode === 410) {
        return {
          statusCode,
          success: false,
          error: errMsg,
          retries,
          isDead: true,
        };
      }

      // Transient errors: 429 rate limit or 5xx server error
      const isTransient =
        statusCode === 429 ||
        (typeof statusCode === "number" && statusCode >= 500 && statusCode <= 504) ||
        errMsg.includes("ETIMEDOUT") ||
        errMsg.includes("ECONNRESET");

      if (isTransient && attempt < maxRetries) {
        retries += 1;
        const delay = attempt === 0 ? 300 : 800;
        await sleep(delay);
        continue;
      }

      return {
        statusCode,
        success: false,
        error: errMsg,
        retries,
        isDead: false,
      };
    }
  }

  return {
    statusCode: (lastErr as { statusCode?: number })?.statusCode,
    success: false,
    error: (lastErr as { message?: string })?.message || "Send failed after retries",
    retries,
    isDead: false,
  };
}

/**
 * Send real Web Push to ALL registered devices for a single user simultaneously.
 * Tracks individual delivery records per device in Redis analytics.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  role?: string,
  targetFingerprintOrDeviceId?: string
): Promise<SendPushResult> {
  const result: SendPushResult = {
    userId,
    subscriptionsFound: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    dead: 0,
    devices: [],
    total: 0,
    details: [],
  };

  if (!ensureVapidConfigured()) {
    console.error("[WebPush] Cannot send push: VAPID is not configured!");
    return result;
  }

  let subscriptions = await getUserSubscriptions(userId, role);

  // If specific single-device diagnostic test requested (e.g. iPhone B test)
  if (targetFingerprintOrDeviceId) {
    const target = targetFingerprintOrDeviceId.toLowerCase();
    subscriptions = subscriptions.filter(
      (s) =>
        (s.deviceId && s.deviceId.toLowerCase() === target) ||
        getEndpointFingerprint(s.endpoint).toLowerCase().includes(target) ||
        s.endpoint.toLowerCase().includes(target)
    );
  }

  result.subscriptionsFound = subscriptions.length;
  result.total = subscriptions.length;

  if (subscriptions.length === 0) {
    console.log(`[WebPush] No matching push subscriptions found for user ${userId}`);
    return result;
  }

  console.log(
    `[WebPush] Fanning out push "${payload.title}" to user ${userId} across ${subscriptions.length} registered device(s)...`
  );

  const deadEndpoints: string[] = [];
  const notificationId =
    payload.notificationId || `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  result.notificationId = notificationId;

  const pushOptions = {
    TTL: 86400, // 24 hours
    urgency: "high" as const, // High priority for iOS APNs & Android FCM wake
  };

  result.attempted = subscriptions.length;
  const nowIso = new Date().toISOString();

  const deliveryRecords: NotificationDeliveryRecord[] = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (sub, idx) => {
      const hostname = getEndpointHostname(sub.endpoint);
      const fingerprint = getEndpointFingerprint(sub.endpoint);
      const { platform, provider } = inferPlatformAndProvider(
        sub.endpoint,
        sub.userAgent,
        sub.platform
      );
      const deviceId =
        sub.deviceId || `dev_${platform.toLowerCase()}_${fingerprint.slice(-6)}`;
      const deliveryId = `del_${notificationId}_${deviceId}_${idx}`;
      const receiptToken = generateReceiptToken(deliveryId, notificationId, deviceId);

      const isFemale =
        payload.gender &&
        (String(payload.gender).includes("انث") ||
          String(payload.gender).includes("أنث") ||
          String(payload.gender).toLowerCase() === "female");

      const defaultBadge = isFemale
        ? "/icons/badge-female-monochrome.png"
        : "/icons/badge-monochrome.png";

      const perDeviceBody = JSON.stringify({
        title: payload.title || "Nasaq Gym",
        body: payload.body || "",
        url: payload.url || "/home",
        tag: payload.tag || undefined,
        image: payload.image || undefined,
        icon: payload.icon || "/icon-192.png",
        badge: payload.badge || defaultBadge,
        timestamp: payload.timestamp || nowIso,
        notificationId,
        deliveryId,
        receiptToken,
        deviceId,
        type: payload.type || undefined,
        actions: payload.actions && payload.actions.length > 0 ? payload.actions : undefined,
      });

      const sendRes = await sendNotificationWithRetry(sub, perDeviceBody, pushOptions);

      const status: DeliveryStatus = sendRes.success ? "provider_accepted" : "failed";

      const deliveryRecord: NotificationDeliveryRecord = {
        deliveryId,
        notificationId,
        userId,
        deviceId,
        platform: sub.platform || platform,
        provider,
        deviceLabel: sub.deviceLabel || `${sub.platform || platform} (${provider})`,
        endpointHostname: hostname,
        endpointFingerprint: fingerprint,
        endpoint: sub.endpoint,
        status,
        statusCode: sendRes.statusCode,
        providerAcceptedAt: sendRes.success ? nowIso : undefined,
        failedAt: !sendRes.success ? nowIso : undefined,
        failureReason: sendRes.error,
        attemptedAt: nowIso,
      };

      deliveryRecords.push(deliveryRecord);

      const deviceResult: DevicePushResult = {
        deliveryId,
        deviceId,
        endpointHostname: hostname,
        endpointFingerprint: fingerprint,
        platform: sub.platform || platform,
        provider,
        deviceLabel: sub.deviceLabel || `${sub.platform || platform} (${provider})`,
        statusCode: sendRes.statusCode,
        success: sendRes.success,
        error: sendRes.error,
        retries: sendRes.retries,
        attemptedAt: nowIso,
      };

      if (sendRes.success) {
        console.log(
          `[WebPush] ✓ Push accepted by ${provider} for ${fingerprint} (HTTP ${sendRes.statusCode})`
        );
      } else {
        console.error(
          `[WebPush] ✗ Push failed for ${fingerprint} [${provider}] (Status ${sendRes.statusCode || "N/A"}):`,
          sendRes.error
        );
        if (sendRes.isDead) {
          deadEndpoints.push(sub.endpoint);
        }
      }

      return { sub, sendRes, deviceResult };
    })
  );

  for (const item of results) {
    if (item.status === "fulfilled") {
      const { deviceResult, sendRes } = item.value;
      result.devices.push(deviceResult);
      result.details.push({
        endpointHostname: deviceResult.endpointHostname,
        statusCode: deviceResult.statusCode,
        success: deviceResult.success,
        error: deviceResult.error,
      });

      if (sendRes.success) {
        result.sent += 1;
      } else {
        result.failed += 1;
        if (sendRes.isDead) {
          result.dead += 1;
        }
      }
    } else {
      result.failed += 1;
      result.devices.push({
        endpointHostname: "unknown",
        endpointFingerprint: "unknown",
        platform: "Unknown",
        provider: "Unknown",
        success: false,
        error: String(item.reason),
        attemptedAt: nowIso,
      });
      result.details.push({
        endpointHostname: "unknown",
        success: false,
        error: String(item.reason),
      });
    }
  }

  // Save / Update full Delivery Summary in Redis for live Analytics drawer
  await saveNotificationSummary({
    notificationId,
    title: payload.title,
    body: payload.body,
    url: payload.url || "/home",
    destinationLabel: payload.url || "/home",
    sentAt: nowIso,
    recipientCount: 1,
    deviceCount: subscriptions.length,
    providerAcceptedCount: result.sent,
    deviceReceivedCount: 0,
    displayRequestedCount: 0,
    clickedCount: 0,
    failedCount: result.failed,
    pendingCount: result.sent,
    deliveries: deliveryRecords,
  });

  // Prune dead subscriptions (404/410) isolated to that exact device
  if (deadEndpoints.length > 0) {
    for (const dead of deadEndpoints) {
      await removeUserSubscription(userId, dead, role);
    }
  }

  return result;
}

/**
 * Send Web Push to MULTIPLE users simultaneously (e.g. Broadcast / Expired / Group).
 * Creates exactly ONE DeliveryRecord per device across all members, saves ONE unified
 * NotificationSummaryRecord in Redis, and returns the master notificationId.
 */
export async function sendPushToMembers(
  memberRecordIds: string[],
  payload: PushPayload,
  memberNamesMap?: Record<string, string>
): Promise<BulkSendPushResult> {
  const notificationId =
    payload.notificationId || `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const summaryResult: BulkSendPushResult = {
    notificationId,
    recipientCount: memberRecordIds.length,
    deviceCount: 0,
    sent: 0,
    failed: 0,
    dead: 0,
    deliveries: [],
  };

  if (!ensureVapidConfigured()) {
    console.error("[WebPush] Cannot send push: VAPID is not configured!");
    return summaryResult;
  }

  const uniqueUserIds = [...new Set(memberRecordIds)].filter(Boolean);
  if (uniqueUserIds.length === 0) return summaryResult;

  // 1. Fetch all subscriptions for all members in parallel
  const userSubsMap = await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const subs = await getUserSubscriptions(userId, "member");
      return { userId, subs };
    })
  );

  // 2. Flatten into individual target device entries
  interface TargetDeviceEntry {
    userId: string;
    userName: string;
    sub: PushSubscriptionJSON;
    subIndex: number;
    deliveryId: string;
  }

  const targetDevices: TargetDeviceEntry[] = [];

  for (const { userId, subs } of userSubsMap) {
    const userName = memberNamesMap?.[userId] || userId;
    subs.forEach((sub, subIndex) => {
      const { platform } = inferPlatformAndProvider(sub.endpoint, sub.userAgent, sub.platform);
      const fingerprint = getEndpointFingerprint(sub.endpoint);
      const deviceId = sub.deviceId || `dev_${platform.toLowerCase()}_${fingerprint.slice(-6)}`;
      const deliveryId = `del_${notificationId}_${userId.slice(-6)}_${deviceId}_${subIndex}`;

      targetDevices.push({
        userId,
        userName,
        sub,
        subIndex,
        deliveryId,
      });
    });
  }

  summaryResult.deviceCount = targetDevices.length;

  if (targetDevices.length === 0) {
    console.log(`[WebPush] No active device subscriptions found for ${uniqueUserIds.length} members`);
    const nowIso = new Date().toISOString();
    await saveNotificationSummary({
      notificationId,
      title: payload.title,
      body: payload.body,
      url: payload.url || "/home",
      destinationLabel: payload.url || "/home",
      sentAt: nowIso,
      recipientCount: uniqueUserIds.length,
      deviceCount: 0,
      providerAcceptedCount: 0,
      deviceReceivedCount: 0,
      displayRequestedCount: 0,
      clickedCount: 0,
      failedCount: 0,
      pendingCount: 0,
      deliveries: [],
    });
    return summaryResult;
  }

  console.log(
    `[WebPush] Fanning out broadcast "${payload.title}" to ${targetDevices.length} devices across ${uniqueUserIds.length} members...`
  );

  const pushOptions = {
    TTL: 86400,
    urgency: "high" as const,
  };

  const nowIso = new Date().toISOString();
  const deadEndpointsMap: Array<{ userId: string; endpoint: string }> = [];
  const deliveryRecords: NotificationDeliveryRecord[] = [];

  // 3. Concurrently send push to every device
  const sendResults = await Promise.allSettled(
    targetDevices.map(async (item) => {
      const { userId, userName, sub, deliveryId } = item;
      const hostname = getEndpointHostname(sub.endpoint);
      const fingerprint = getEndpointFingerprint(sub.endpoint);
      const { platform, provider } = inferPlatformAndProvider(
        sub.endpoint,
        sub.userAgent,
        sub.platform
      );
      const deviceId = sub.deviceId || `dev_${platform.toLowerCase()}_${fingerprint.slice(-6)}`;
      const receiptToken = generateReceiptToken(deliveryId, notificationId, deviceId);

      const isFemale =
        payload.gender &&
        (String(payload.gender).includes("انث") ||
          String(payload.gender).includes("أنث") ||
          String(payload.gender).toLowerCase() === "female");

      const defaultBadge = isFemale
        ? "/icons/badge-female-monochrome.png"
        : "/icons/badge-monochrome.png";

      const perDeviceBody = JSON.stringify({
        title: payload.title || "Nasaq Gym",
        body: payload.body || "",
        url: payload.url || "/home",
        tag: payload.tag || undefined,
        image: payload.image || undefined,
        icon: payload.icon || "/icon-192.png",
        badge: payload.badge || defaultBadge,
        sound: payload.sound || "/sounds/notification.mp3",
        timestamp: payload.timestamp || nowIso,
        notificationId,
        deliveryId,
        receiptToken,
        deviceId,
        type: payload.type || undefined,
        actions: payload.actions || [],
      });

      const sendRes = await sendNotificationWithRetry(sub, perDeviceBody, pushOptions);

      const status: DeliveryStatus = sendRes.success ? "provider_accepted" : "failed";

      const deliveryRecord: NotificationDeliveryRecord = {
        deliveryId,
        notificationId,
        userId,
        userName,
        deviceId,
        platform: sub.platform || platform,
        provider,
        deviceLabel: sub.deviceLabel || `${sub.platform || platform} (${provider})`,
        endpointHostname: hostname,
        endpointFingerprint: fingerprint,
        endpoint: sub.endpoint,
        status,
        statusCode: sendRes.statusCode,
        providerAcceptedAt: sendRes.success ? nowIso : undefined,
        failedAt: !sendRes.success ? nowIso : undefined,
        failureReason: sendRes.error,
        attemptedAt: nowIso,
      };

      if (!sendRes.success && sendRes.isDead) {
        deadEndpointsMap.push({ userId, endpoint: sub.endpoint });
      }

      return { deliveryRecord, sendRes };
    })
  );

  for (const res of sendResults) {
    if (res.status === "fulfilled") {
      const { deliveryRecord, sendRes } = res.value;
      deliveryRecords.push(deliveryRecord);
      if (sendRes.success) {
        summaryResult.sent += 1;
      } else {
        summaryResult.failed += 1;
        if (sendRes.isDead) summaryResult.dead += 1;
      }
    }
  }

  summaryResult.deliveries = deliveryRecords;

  // 4. Save the ONE master NotificationSummaryRecord in Redis with ALL delivery records
  await saveNotificationSummary({
    notificationId,
    title: payload.title,
    body: payload.body,
    url: payload.url || "/home",
    destinationLabel: payload.url || "/home",
    sentAt: nowIso,
    recipientCount: uniqueUserIds.length,
    deviceCount: deliveryRecords.length,
    providerAcceptedCount: summaryResult.sent,
    deviceReceivedCount: 0,
    displayRequestedCount: 0,
    clickedCount: 0,
    failedCount: summaryResult.failed,
    pendingCount: summaryResult.sent,
    deliveries: deliveryRecords,
  });

  // 5. Clean up dead endpoints
  for (const { userId, endpoint } of deadEndpointsMap) {
    await removeUserSubscription(userId, endpoint, "member");
  }

  return summaryResult;
}

/**
 * Store or update notification delivery summary in Redis with 7-day TTL.
 */
export async function saveNotificationSummary(summary: NotificationSummaryRecord): Promise<void> {
  const key = `push_delivery_summary:${summary.notificationId}`;
  await setInRedis(key, summary, 7 * 86400);

  // Keep a recent list of notification IDs for Admin history view
  const recentListKey = "push_recent_notification_ids";
  const recentIds = (await getFromRedis<string[]>(recentListKey)) || [];
  if (!recentIds.includes(summary.notificationId)) {
    const updatedIds = [summary.notificationId, ...recentIds.filter((id) => id !== summary.notificationId)].slice(0, 30);
    await setInRedis(recentListKey, updatedIds, 7 * 86400);
  }
}

/**
 * Retrieve notification delivery summary with all per-device records.
 */
export async function getNotificationSummary(
  notificationId: string
): Promise<NotificationSummaryRecord | null> {
  if (!notificationId) return null;
  const key = `push_delivery_summary:${notificationId}`;
  return await getFromRedis<NotificationSummaryRecord>(key);
}

const ALLOWED_STAGES = ["received", "display_requested", "clicked"] as const;
export type TelemetryStage = (typeof ALLOWED_STAGES)[number];

/**
 * Record real-time delivery telemetry from Service Worker (received, display_requested, clicked).
 * Enforces stage whitelist, valid stage progression, and idempotency.
 */
export async function recordDeliveryReceipt(
  notificationId: string,
  deliveryId: string,
  stage: TelemetryStage,
  deviceId?: string
): Promise<{ success: boolean; reason?: string }> {
  if (!notificationId || !deliveryId) {
    return { success: false, reason: "Missing notificationId or deliveryId" };
  }

  if (!ALLOWED_STAGES.includes(stage)) {
    return { success: false, reason: `Invalid stage '${stage}'` };
  }

  const summary = await getNotificationSummary(notificationId);
  if (!summary || !Array.isArray(summary.deliveries)) {
    return { success: false, reason: "Delivery summary not found" };
  }

  const del = summary.deliveries.find(
    (d) => d.deliveryId === deliveryId || (deviceId && d.deviceId === deviceId)
  );
  if (!del) {
    return { success: false, reason: "Delivery record not found for this deliveryId" };
  }

  const now = new Date().toISOString();
  let updated = false;

  if (stage === "received") {
    // Idempotent: record first received timestamp
    if (!del.deviceReceivedAt) {
      del.deviceReceivedAt = now;
      updated = true;
    }
    // Only upgrade status if not already display_requested or clicked
    if (del.status === "pending" || del.status === "provider_accepted") {
      del.status = "device_received";
      updated = true;
    }
  } else if (stage === "display_requested") {
    if (!del.displayRequestedAt) {
      del.displayRequestedAt = now;
      updated = true;
    }
    if (!del.deviceReceivedAt) {
      del.deviceReceivedAt = now;
      updated = true;
    }
    if (del.status !== "clicked") {
      del.status = "display_requested";
      updated = true;
    }
  } else if (stage === "clicked") {
    if (!del.clickedAt) {
      del.clickedAt = now;
      updated = true;
    }
    if (!del.deviceReceivedAt) {
      del.deviceReceivedAt = now;
      updated = true;
    }
    if (!del.displayRequestedAt) {
      del.displayRequestedAt = now;
      updated = true;
    }
    del.status = "clicked";
    updated = true;
  }

  if (updated) {
    summary.deviceReceivedCount = summary.deliveries.filter(
      (d) => d.status === "device_received" || d.status === "display_requested" || d.status === "clicked"
    ).length;
    summary.displayRequestedCount = summary.deliveries.filter(
      (d) => d.status === "display_requested" || d.status === "clicked"
    ).length;
    summary.clickedCount = summary.deliveries.filter((d) => d.status === "clicked").length;
    summary.pendingCount = Math.max(0, summary.providerAcceptedCount - summary.deviceReceivedCount);

    await saveNotificationSummary(summary);
  }

  return { success: true };
}

// Aliases for backwards compatibility
export const getMemberSubscriptions = getUserSubscriptions;
export const saveMemberSubscription = (id: string, s: PushSubscriptionJSON) =>
  saveUserSubscription(id, s, "member");
export const removeMemberSubscription = (id: string, endpoint: string) =>
  removeUserSubscription(id, endpoint, "member");
export const sendPushToMember = (id: string, p: PushPayload) =>
  sendPushToUser(id, p, "member");
