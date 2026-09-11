/**
 * Ultra Gym — MyFatoorah Payment Gateway Integration
 *
 * Official API v2 Client for MyFatoorah (Sandbox / Test Mode default).
 *
 * SECURITY:
 *  - MYFATOORAH_API_TOKEN is strictly server-side (NEVER exposed to frontend).
 *  - Uses hosted checkout (POST /v2/SendPayment) — no card numbers collected by Ultra Gym.
 *  - Always uses server-authoritative pricing and currency (JOD).
 *  - Payment status verified server-side via POST /v2/GetPaymentStatus before any fulfillment.
 *
 * API Documentation: https://myfatoorah.readme.io/docs
 */

import { getAuthoritativePlan } from "@/lib/membershipPlans";

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_SANDBOX_URL = "https://apitest.myfatoorah.com";

export function getMyFatoorahBaseUrl(): string {
  return (
    process.env.MYFATOORAH_BASE_URL ||
    DEFAULT_SANDBOX_URL
  ).replace(/\/+$/, "");
}

export function isMyFatoorahTestMode(): boolean {
  return process.env.MYFATOORAH_TEST_MODE !== "false";
}

export function isMyFatoorahConfigured(): boolean {
  const token = process.env.MYFATOORAH_API_TOKEN;
  return Boolean(token && token.trim().length > 10);
}

function getApiToken(): string {
  const token = process.env.MYFATOORAH_API_TOKEN;
  if (!token) {
    throw new Error("MyFatoorah Sandbox API token is not configured");
  }
  return token.trim();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceParams {
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string | null;
  planId: string;
  paymentRef: string;
  callBackUrl: string;
  errorUrl: string;
}

export interface CreateInvoiceResult {
  success: boolean;
  invoiceId?: number;
  paymentUrl?: string;
  customerReference?: string;
  error?: string;
  raw?: unknown;
}

export interface PaymentStatusTransaction {
  TransactionDate?: string;
  transactionDate?: string;
  PaymentGateway?: string;
  paymentGateway?: string;
  TransactionStatus?: string; // "Succss", "Failed", "Canceled"
  transactionStatus?: string;
  TransactionValue?: string | number;
  transactionValue?: string | number;
  PaymentId?: string;
  paymentId?: string;
  Currency?: string;
  currency?: string;
  Error?: string;
  error?: string;
}

export interface PaymentStatusResult {
  success: boolean;
  isPaid: boolean;
  isCancelled: boolean;
  isFailed: boolean;
  invoiceId?: number;
  invoiceStatus?: string; // "Paid", "Unpaid", "Pending", "Cancelled"
  invoiceValue?: number;
  displayCurrency?: string;
  customerReference?: string;
  userDefinedField?: string;
  transactions?: PaymentStatusTransaction[];
  primaryPaymentId?: string;
  error?: string;
  raw?: unknown;
}

// ── API Methods ──────────────────────────────────────────────────────────────

/**
 * Creates a hosted payment invoice in MyFatoorah for a membership plan renewal.
 * Uses authoritative pricing from `MEMBERSHIP_PLANS`.
 *
 * Calls `POST /v2/SendPayment`.
 */
export async function createPaymentInvoice(
  params: CreateInvoiceParams
): Promise<CreateInvoiceResult> {
  const {
    memberName,
    memberEmail,
    memberPhone,
    planId,
    paymentRef,
    callBackUrl,
    errorUrl,
  } = params;

  // 1. Enforce authoritative plan price server-side
  const plan = await getAuthoritativePlan(planId);

  // 2. Build MyFatoorah SendPayment Payload
  // Clean phone number: separate country code and mobile (max 11 chars)
  let mobileCountryCode: string | undefined = undefined;
  let customerMobile: string | undefined = undefined;

  if (memberPhone) {
    const raw = memberPhone.trim();
    if (raw.startsWith("+962")) {
      mobileCountryCode = "+962";
      customerMobile = raw.slice(4).replace(/\D/g, "").slice(0, 11);
    } else if (raw.startsWith("00962")) {
      mobileCountryCode = "+962";
      customerMobile = raw.slice(5).replace(/\D/g, "").slice(0, 11);
    } else if (raw.startsWith("+")) {
      mobileCountryCode = raw.slice(0, 4);
      customerMobile = raw.slice(4).replace(/\D/g, "").slice(0, 11);
    } else {
      customerMobile = raw.replace(/\D/g, "").slice(0, 11);
    }
  }

  const payload = {
    CustomerName: memberName.slice(0, 50) || "Nasaq Gym Member",
    NotificationOption: "LNK", // Link-based payment
    InvoiceValue: plan.price,
    DisplayCurrencyIso: plan.currency, // "JOD"
    CallBackUrl: callBackUrl,
    ErrorUrl: errorUrl,
    CustomerReference: paymentRef,
    CustomerEmail: memberEmail || "member@nasaqjo.com",
    MobileCountryCode: mobileCountryCode,
    CustomerMobile: customerMobile || undefined,
    Language: "ar",
    InvoiceItems: [
      {
        ItemName: `${plan.nameAr} - Nasaq Gym`,
        Quantity: 1,
        UnitPrice: plan.price,
      },
    ],
    UserDefinedField: JSON.stringify({
      memberId: params.memberId,
      planId: plan.id,
      paymentRef,
    }),
  };

  if (!isMyFatoorahConfigured()) {
    console.error("[MyFatoorah] MyFatoorah Sandbox API token is not configured.");
    return {
      success: false,
      error: "MyFatoorah Sandbox API token is not configured.",
    };
  }

  const baseUrl = getMyFatoorahBaseUrl();
  const token = getApiToken();

  try {
    const res = await fetch(`${baseUrl}/v2/SendPayment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.IsSuccess && data?.Data?.InvoiceURL) {
      return {
        success: true,
        invoiceId: data.Data.InvoiceId,
        paymentUrl: data.Data.InvoiceURL,
        customerReference: data.Data.CustomerReference || paymentRef,
        raw: data,
      };
    }

    const errMessage =
      data?.ValidationErrors?.map((e: { Error: string }) => e.Error).join(", ") ||
      data?.Message ||
      `HTTP ${res.status}: Failed to create payment invoice`;

    console.error("[MyFatoorah] CreateInvoice failed:", errMessage);
    return {
      success: false,
      error: errMessage,
      raw: data,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[MyFatoorah] CreateInvoice network error:", errMsg);
    return {
      success: false,
      error: `Connection error with payment gateway: ${errMsg}`,
    };
  }
}

/**
 * Queries MyFatoorah to verify the actual authoritative status of a payment.
 * MUST be called before marking any subscription as paid.
 *
 * Calls `POST /v2/GetPaymentStatus`.
 *
 * @param key PaymentId or InvoiceId
 * @param keyType "PaymentId" | "InvoiceId" | "CustomerReference"
 */
export async function getPaymentStatus(
  key: string,
  keyType: "PaymentId" | "InvoiceId" | "CustomerReference" = "PaymentId"
): Promise<PaymentStatusResult> {
  if (!isMyFatoorahConfigured()) {
    console.error("[MyFatoorah] MyFatoorah Sandbox API token is not configured.");
    return {
      success: false,
      isPaid: false,
      isCancelled: false,
      isFailed: true,
      error: "MyFatoorah Sandbox API token is not configured.",
    };
  }

  const baseUrl = getMyFatoorahBaseUrl();
  const token = getApiToken();

  const payload = {
    Key: key,
    KeyType: keyType,
  };

  try {
    const res = await fetch(`${baseUrl}/v2/GetPaymentStatus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.IsSuccess || !data?.Data) {
      const errMsg =
        data?.ValidationErrors?.map((e: { Error: string }) => e.Error).join(", ") ||
        data?.Message ||
        `HTTP ${res.status}: Failed to query payment status`;

      console.warn("[MyFatoorah] GetPaymentStatus unsuccessful:", errMsg);
      return {
        success: false,
        isPaid: false,
        isCancelled: false,
        isFailed: true,
        error: errMsg,
        raw: data,
      };
    }

    const d = data.Data;
    const invoiceStatus = String(d.InvoiceStatus || "").trim();
    const transactions: PaymentStatusTransaction[] = d.InvoiceTransactions || [];

    // Check if any transaction has "Succss" (official MyFatoorah spelling) or invoice is "Paid"
    const hasSuccessfulTransaction = transactions.some(
      (tx) =>
        String(tx.TransactionStatus).toLowerCase() === "succss" ||
        String(tx.TransactionStatus).toLowerCase() === "success"
    );

    const isPaid = invoiceStatus.toLowerCase() === "paid" || hasSuccessfulTransaction;
    const isCancelled =
      invoiceStatus.toLowerCase() === "cancelled" ||
      invoiceStatus.toLowerCase() === "canceled";
    const isFailed = !isPaid && !isCancelled && invoiceStatus.toLowerCase() !== "pending";

    // Primary payment ID from successful transaction, or first transaction
    const primaryTx =
      transactions.find(
        (tx) =>
          String(tx.TransactionStatus).toLowerCase() === "succss" ||
          String(tx.TransactionStatus).toLowerCase() === "success"
      ) || transactions[0];

    return {
      success: true,
      isPaid,
      isCancelled,
      isFailed,
      invoiceId: d.InvoiceId,
      invoiceStatus,
      invoiceValue: Number(d.InvoiceValue),
      displayCurrency: d.InvoiceDisplayValue ? String(d.InvoiceDisplayValue).split(" ")[1] : "JOD",
      customerReference: d.CustomerReference,
      userDefinedField: d.UserDefinedField,
      transactions,
      primaryPaymentId: primaryTx?.PaymentId,
      raw: data,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[MyFatoorah] GetPaymentStatus network error:", errMsg);
    return {
      success: false,
      isPaid: false,
      isCancelled: false,
      isFailed: false,
      error: `Payment verification network error: ${errMsg}`,
    };
  }
}
