import { getRecords } from "@/lib/airtable";
import { TABLES, LIVE_BOARD_FIELDS } from "@/lib/constants";
import { withCacheSWR } from "@/lib/cacheService";
import {
  type GymWhatsAppInfo,
  normalizePhoneForWhatsApp,
  formatPhoneForDisplay,
  createWhatsAppLink,
} from "@/lib/whatsappUtils";

export * from "@/lib/whatsappUtils";

/**
 * WhatsApp is disconnected from the current system as requested,
 * in preparation for being connected with a new external system.
 */
export async function getGymWhatsAppContact(): Promise<GymWhatsAppInfo> {
  return {
    phone: null,
    displayPhone: null,
    isLinked: false,
    waUrl: null,
  };
}

