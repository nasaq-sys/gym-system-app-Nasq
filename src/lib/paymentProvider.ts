/**
 * Ultra Gym — Payment Provider Abstraction
 *
 * Provides a pluggable, provider-agnostic factory for payment processing.
 *
 * Supported Providers:
 *  - "mock"       : Internal Mock Payment Provider (0 external API calls, 0 credentials, 0 real money)
 *  - "paytabs"    : PayTabs Hosted Payment Page (PT2 API)
 *  - "myfatoorah" : MyFatoorah Hosted Invoicing (API v2)
 */

export type PaymentProviderType = "mock" | "paytabs" | "myfatoorah";

export interface PaymentProviderConfig {
  id: PaymentProviderType;
  nameAr: string;
  nameEn: string;
  isDemo: boolean;
  isExternal: boolean;
}

export function getActivePaymentProvider(): PaymentProviderConfig {
  const provider = (process.env.PAYMENT_PROVIDER || "myfatoorah").toLowerCase().trim() as PaymentProviderType;

  switch (provider) {
    case "paytabs":
      return {
        id: "paytabs",
        nameAr: "PayTabs",
        nameEn: "PayTabs",
        isDemo: process.env.PAYTABS_TEST_MODE !== "false",
        isExternal: true,
      };
    case "mock":
      return {
        id: "mock",
        nameAr: "الدفع التجريبي (بدون أموال حقيقية)",
        nameEn: "Demo Payment (No Real Money)",
        isDemo: true,
        isExternal: false,
      };
    case "myfatoorah":
    default:
      return {
        id: "myfatoorah",
        nameAr: "MyFatoorah",
        nameEn: "MyFatoorah",
        isDemo: process.env.MYFATOORAH_TEST_MODE !== "false",
        isExternal: true,
      };
  }
}
