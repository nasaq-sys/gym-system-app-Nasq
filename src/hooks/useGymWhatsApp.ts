"use client";

import { useEffect, useState, useCallback } from "react";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";
import { useI18n } from "@/hooks/useI18n";
import {
  type GymWhatsAppInfo,
  createWhatsAppLink,
  getDefaultWhatsAppMessage,
} from "@/lib/whatsappUtils";

const API_PATH = "/api/whatsapp/contact";

export function useGymWhatsApp() {
  const { locale } = useI18n();
  const cached = getClientCachedData<GymWhatsAppInfo>(API_PATH);

  const [contact, setContact] = useState<GymWhatsAppInfo>(
    cached && typeof cached === "object" && "isLinked" in cached
      ? cached
      : {
          phone: null,
          displayPhone: null,
          isLinked: false,
          waUrl: null,
        }
  );
  const [loading, setLoading] = useState(!cached);

  const fetchContact = useCallback(async () => {
    try {
      const res = await clientFetch<GymWhatsAppInfo | { data: GymWhatsAppInfo }>(
        API_PATH,
        undefined,
        { ttlMs: 30000 }
      );
      if (res) {
        const payload = ("phone" in res ? res : (res as { data: GymWhatsAppInfo }).data) as GymWhatsAppInfo;
        if (payload) {
          setContact(payload);
        }
      }
    } catch {
      // Keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const openWhatsApp = useCallback(
    (customMessage?: string, memberName?: string) => {
      if (!contact.phone) return;
      const msg = customMessage ?? getDefaultWhatsAppMessage(locale, memberName);
      const url = createWhatsAppLink(contact.phone, msg);
      if (url && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    [contact.phone, locale]
  );

  return {
    phone: contact.phone,
    displayPhone: contact.displayPhone,
    isLinked: contact.isLinked,
    waUrl: contact.waUrl,
    loading,
    openWhatsApp,
    refetch: fetchContact,
  };
}
