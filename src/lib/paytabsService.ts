/**
 * Ultra Gym — PayTabs Payment Gateway Integration (PT2 API)
 *
 * Configured for PayTabs TEST Profile (Jordan / MENA).
 *
 * SECURITY:
 *  - PAYTABS_SERVER_KEY is strictly server-side (NEVER exposed to frontend).
 *  - Uses hosted payment page (POST /payment/request) — no card data enters Ultra Gym.
 *  - Always uses server-authoritative pricing and currency (JOD).
 *  - Queries PayTabs server-to-server before any subscription renewal.
 *  - HMAC-SHA256 signature verification for webhook callbacks.
 *
 * PayTabs PT2 API Documentation: https://docs.paytabs.com
 */

import crypto from "crypto";
import { getAuthoritativePlan } from "@/lib/membershipPlans";

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_JORDAN_ENDPOINT = "https://secure-jordan.paytabs.com";

export function getPayTabsBaseUrl(): string {
  return (
    process.env.PAYTABS_BASE_URL ||
    DEFAULT_JORDAN_ENDPOINT
  ).replace(/\/+$/, "");
}

export function isPayTabsTestMode(): boolean {
  return process.env.PAYTABS_TEST_MODE !== "false";
}

export function getPayTabsProfileId(): string {
  const profileId = process.env.PAYTABS_PROFILE_ID;
  if (!profileId) {
    throw new Error("PAYTABS_PROFILE_ID is not configured in server environment");
  }
  return profileId.trim();
}

function getServerKey(): string {
  const key = process.env.PAYTABS_SERVER_KEY;
  if (!key) {
    throw new Error("PAYTABS_SERVER_KEY is not configured in server environment");
  }
  return key.trim();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatePayTabsPaymentParams {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string | null;
  planId: string;
  paymentRef: string; // cart_id
  returnUrl: string;
  callbackUrl: string;
  clientIp?: string;
}

export interface CreatePayTabsPaymentResult {
  success: boolean;
  tranRef?: string;
  paymentUrl?: string; // redirect_url
  cartId?: string;
  error?: string;
  raw?: unknown;
}

export interface NormalizedPayTabsStatus {
  success: boolean;
  isPaid: boolean;
  isCancelled: boolean;
  isFailed: boolean;
  tranRef?: string;
  cartId?: string;
  cartAmount?: number;
  cartCurrency?: string;
  responseStatus?: string; // "A", "C", "D", "E", "H"
  responseCode?: string;
  responseMessage?: string;
  userDefined?: {
    memberId?: string;
    planId?: string;
    paymentRef?: string;
  };
  error?: string;
  raw?: unknown;
}

// ── API Methods ──────────────────────────────────────────────────────────────

/**
 * Initiates a PayTabs Hosted Payment Page request for subscription renewal.
 * Calls `POST /payment/request`.
 */
export async function createPayTabsPayment(
  params: CreatePayTabsPaymentParams
): Promise<CreatePayTabsPaymentResult> {
  const {
    memberId,
    memberName,
    memberEmail,
    memberPhone,
    planId,
    paymentRef,
    returnUrl,
    callbackUrl,
    clientIp,
  } = params;

  // 1. Enforce server-authoritative plan price
  const plan = await getAuthoritativePlan(planId);
  const baseUrl = getPayTabsBaseUrl();
  const serverKey = getServerKey();
  const profileId = getPayTabsProfileId();

  // Clean phone number
  const cleanPhone = memberPhone ? memberPhone.replace(/[^\d+]/g, "") : "+962790000000";

  const payload = {
    profile_id: profileId,
    tran_type: "sale",
    tran_class: "ecom",
    cart_id: paymentRef,
    cart_description: `Nasaq Gym - ${plan.nameAr} (${plan.durationDays} يوم)`,
    cart_currency: plan.currency, // "JOD"
    cart_amount: plan.price,
    callback: callbackUrl,
    return: returnUrl,
    hide_shipping: true,
    customer_details: {
      name: (memberName || "عضو Nasaq Gym").slice(0, 50),
      email: memberEmail || "member@nasaqjo.com",
      phone: cleanPhone,
      street1: "Amman",
      city: "Amman",
      state: "Amman",
      country: "JO",
      ip: clientIp || "127.0.0.1",
    },
    user_defined: {
      udf1: memberId,
      udf2: plan.id,
      udf3: paymentRef,
    },
  };

  try {
    const res = await fetch(`${baseUrl}/payment/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await res.json().catch(() => null);

    if (res.ok && (data?.redirect_url || data?.redirectUrl)) {
      return {
        success: true,
        tranRef: data.tran_ref || data.tranRef,
        paymentUrl: data.redirect_url || data.redirectUrl,
        cartId: data.cart_id || paymentRef,
        raw: data,
      };
    }

    const errMessage =
      data?.message ||
      data?.detail ||
      `HTTP ${res.status}: Failed to create PayTabs payment session`;

    console.error("[PayTabs] createPayment failed:", errMessage);
    return {
      success: false,
      error: errMessage,
      raw: data,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PayTabs] createPayment network error:", errMsg);
    return {
      success: false,
      error: `Connection error with PayTabs: ${errMsg}`,
    };
  }
}

/**
 * Queries PayTabs server-to-server to verify the actual status of a transaction.
 * Calls `POST /payment/query`.
 */
export async function queryPayTabsPayment(
  tranRef: string
): Promise<NormalizedPayTabsStatus> {
  const baseUrl = getPayTabsBaseUrl();
  const serverKey = getServerKey();
  const profileId = getPayTabsProfileId();

  const payload = {
    profile_id: profileId,
    tran_ref: tranRef,
  };

  try {
    const res = await fetch(`${baseUrl}/payment/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: serverKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      const errMsg = data?.message || `HTTP ${res.status}: Failed to query PayTabs transaction`;
      return {
        success: false,
        isPaid: false,
        isCancelled: false,
        isFailed: true,
        error: errMsg,
        raw: data,
      };
    }

    return normalizePayTabsStatus(data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PayTabs] queryPayment network error:", errMsg);
    return {
      success: false,
      isPaid: false,
      isCancelled: false,
      isFailed: false,
      error: `PayTabs verification network error: ${errMsg}`,
    };
  }
}

/**
 * Normalizes PayTabs PT2 API transaction response into a standardized format.
 */
export function normalizePayTabsStatus(data: any): NormalizedPayTabsStatus {
  const paymentResult = data.payment_result || {};
  const responseStatus = String(paymentResult.response_status || "").toUpperCase(); // "A", "C", "D", "E", "H"
  const responseCode = String(paymentResult.response_code || "");
  const responseMessage = String(paymentResult.response_message || "");

  // "A" = Authorized / Captured (Success)
  const isPaid = responseStatus === "A" || responseCode === "000" || responseCode === "100";
  const isCancelled = responseStatus === "C";
  const isFailed = !isPaid && !isCancelled;

  const cartAmount =
    typeof data.cart_amount === "number"
      ? data.cart_amount
      : parseFloat(data.cart_amount) || 0;

  return {
    success: true,
    isPaid,
    isCancelled,
    isFailed,
    tranRef: data.tran_ref || data.tranRef,
    cartId: data.cart_id || data.cartId,
    cartAmount,
    cartCurrency: data.cart_currency || "JOD",
    responseStatus,
    responseCode,
    responseMessage,
    userDefined: {
      memberId: data.user_defined?.udf1,
      planId: data.user_defined?.udf2,
      paymentRef: data.user_defined?.udf3,
    },
    raw: data,
  };
}

/**
 * Verifies the HMAC-SHA256 signature sent by PayTabs in Webhook / Callback headers.
 */
export function verifyPayTabsSignature(
  rawBody: string,
  signatureHeader?: string | null
): boolean {
  if (!signatureHeader) return false;

  try {
    const serverKey = getServerKey();
    const computed = crypto
      .createHmac("sha256", serverKey)
      .update(rawBody)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(computed.toLowerCase()),
      Buffer.from(signatureHeader.trim().toLowerCase())
    );
  } catch (err) {
    console.warn("[PayTabs] Signature verification error:", err);
    return false;
  }
}
