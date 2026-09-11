export interface GymWhatsAppInfo {
  phone: string | null;
  displayPhone: string | null;
  isLinked: boolean;
  waUrl: string | null;
}

/**
 * Normalizes a phone number for WhatsApp URLs (digits only with international country code).
 */
export function normalizePhoneForWhatsApp(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/[^\d]/g, "");
  if (!digits || digits.length < 7) return null;

  // Jordanian local format: 07XXXXXXXX -> 9627XXXXXXXX
  if (digits.startsWith("07") && digits.length === 10) {
    return `962${digits.slice(1)}`;
  }
  // Jordanian short format: 7XXXXXXXX -> 9627XXXXXXXX
  if (digits.startsWith("7") && digits.length === 9) {
    return `962${digits}`;
  }
  // Standard format
  return digits;
}

/**
 * Formats a phone number for friendly UI display (+962 7X XXX XXXX).
 */
export function formatPhoneForDisplay(cleanDigits: string | null | undefined): string | null {
  if (!cleanDigits) return null;
  if (cleanDigits.startsWith("962") && cleanDigits.length === 12) {
    return `+962 ${cleanDigits.slice(3, 5)} ${cleanDigits.slice(5, 8)} ${cleanDigits.slice(8)}`;
  }
  return `+${cleanDigits}`;
}

/**
 * Generates direct WhatsApp chat URL with optional pre-filled message.
 */
export function createWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const clean = normalizePhoneForWhatsApp(phone);
  if (!clean) return null;
  const query = message ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${clean}${query}`;
}

/**
 * Returns a localized default support message.
 */
export function getDefaultWhatsAppMessage(locale: string = "ar", memberName?: string): string {
  const isAr = locale === "ar";
  const nameSuffix = memberName && memberName !== "Member" ? ` (${memberName})` : "";
  if (isAr) {
    return `مرحباً، أنا متدرب في Nasaq Gym${nameSuffix} وأود الاستفسار عن الخدمات والمتابعة.`;
  }
  return `Hello, I am a Nasaq Gym trainee${nameSuffix} and would like to inquire about services and assistance.`;
}
