"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { getDictionary, t as translate, type TranslationDict } from "@/i18n";
import type { Locale } from "@/lib/constants";

interface I18nContextValue {
  locale: Locale;
  dict: TranslationDict;
  t: (path: string, params?: Record<string, string>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dict, setDict] = useState<TranslationDict>(() =>
    getDictionary(initialLocale)
  );

  // app/layout.tsx now reads the locale cookie server-side and renders the
  // root <html> with the correct dir/lang from the first server response,
  // so this effect is mostly a client-side safety net keeping dir/lang in
  // sync whenever `locale` changes via setLocale() below. It still runs on
  // initial mount too (not just on change) in case this provider is ever
  // reused somewhere the server-rendered value could be stale.
  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setDict(getDictionary(newLocale));
    document.cookie = `gojim_locale=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}`;
  }, []);

  const t = useCallback(
    (path: string, params?: Record<string, string>) =>
      translate(dict, path, params),
    [dict]
  );

  return (
    <I18nContext.Provider value={{ locale, dict, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
