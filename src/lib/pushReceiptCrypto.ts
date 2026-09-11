import crypto from "crypto";

// Cryptographically secure HMAC-SHA256 receipt token authorization for Web Push delivery telemetry.
// Allows Service Worker to submit trusted delivery receipts (received, display_requested, clicked)
// in background / closed state without requiring session cookies or credentials, while preventing forgery.

export interface ReceiptTokenPayload {
  v: number; // Token format version
  did: string; // Delivery ID
  nid: string; // Notification ID
  dev: string; // Device ID or fingerprint
  iat: number; // Issued at (Unix epoch seconds)
  exp: number; // Expires at (Unix epoch seconds)
}

function base64UrlEncode(strOrBuf: string | Buffer): string {
  const buf = typeof strOrBuf === "string" ? Buffer.from(strOrBuf, "utf8") : strOrBuf;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

function getSigningSecrets(): string[] {
  const primary = process.env.PUSH_RECEIPT_SIGNING_SECRET?.trim();
  const previous = process.env.PUSH_RECEIPT_SIGNING_SECRET_PREV?.trim();

  const secrets: string[] = [];
  if (primary) secrets.push(primary);
  if (previous) secrets.push(previous);

  // Fallback: if no dedicated receipt secret is set yet, derive a deterministic server-only key
  // from VAPID_PRIVATE_KEY so tokens work securely out of the box.
  if (secrets.length === 0) {
    const vapidPriv = process.env.VAPID_PRIVATE_KEY || "ultra-gym-push-default-salt";
    const derived = crypto
      .createHmac("sha256", "ug-receipt-signing-kdf-salt")
      .update(vapidPriv)
      .digest("hex");
    secrets.push(derived);
  }

  return secrets;
}

/**
 * Generate a tamper-proof HMAC-SHA256 receipt authorization token for a specific delivery.
 * Default TTL: 72 hours (259,200 seconds) covering full Push lifecycle + network delay grace period.
 */
export function generateReceiptToken(
  deliveryId: string,
  notificationId: string,
  deviceId: string,
  ttlSeconds: number = 72 * 3600
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: ReceiptTokenPayload = {
    v: 1,
    did: deliveryId,
    nid: notificationId,
    dev: deviceId,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const primarySecret = getSigningSecrets()[0];

  const signature = crypto
    .createHmac("sha256", primarySecret)
    .update(payloadB64)
    .digest();

  const signatureB64 = base64UrlEncode(signature);
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify a receipt authorization token with constant-time HMAC check, expiration,
 * and deliveryId / notificationId binding. Supports zero-downtime secret rotation.
 */
export function verifyReceiptToken(
  token: unknown,
  expectedDeliveryId: string,
  expectedNotificationId?: string
): { valid: boolean; reason?: string; payload?: ReceiptTokenPayload } {
  if (typeof token !== "string" || !token.trim()) {
    return { valid: false, reason: "Missing receipt authorization token" };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: "Malformed receipt token format" };
  }

  const [payloadB64, signatureB64] = parts;

  // 1. Verify HMAC signature against active or previous rotating secret
  const secrets = getSigningSecrets();
  let signatureValid = false;

  for (const secret of secrets) {
    try {
      const expectedSig = crypto
        .createHmac("sha256", secret)
        .update(payloadB64)
        .digest();

      const expectedSigB64 = base64UrlEncode(expectedSig);

      if (
        expectedSigB64.length === signatureB64.length &&
        crypto.timingSafeEqual(Buffer.from(expectedSigB64), Buffer.from(signatureB64))
      ) {
        signatureValid = true;
        break;
      }
    } catch {}
  }

  if (!signatureValid) {
    return { valid: false, reason: "Invalid token cryptographic signature" };
  }

  // 2. Parse payload safely
  let payload: ReceiptTokenPayload;
  try {
    const rawJson = base64UrlDecode(payloadB64);
    payload = JSON.parse(rawJson);
  } catch {
    return { valid: false, reason: "Invalid token payload encoding" };
  }

  if (!payload || typeof payload !== "object" || payload.v !== 1) {
    return { valid: false, reason: "Unsupported token version or structure" };
  }

  // 3. Verify deliveryId binding (Strict anti-forgery binding)
  if (payload.did !== expectedDeliveryId) {
    return { valid: false, reason: "Token is not authorized for this deliveryId" };
  }

  // 4. Verify notificationId binding if provided
  if (expectedNotificationId && payload.nid && payload.nid !== expectedNotificationId) {
    return { valid: false, reason: "Token is not authorized for this notificationId" };
  }

  // 5. Verify expiration
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now > payload.exp) {
    return { valid: false, reason: "Receipt authorization token has expired" };
  }

  return { valid: true, payload };
}
