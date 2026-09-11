"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";

// App Router convention: this renders automatically for any route that
// doesn't match a real page (including deep, invalid, or stale links) —
// there was no custom version of this file before, so every bad URL fell
// back to Next's own plain default 404, which doesn't share the app's dark
// theme/branding and can read as a blank white screen. This is the correct,
// idiomatic fix for a Next.js app on Netlify — NOT a Netlify `_redirects`
// catch-all, which is for static SPAs with a single client-routed
// index.html; blindly rewriting every path to index.html here would break
// this app's real API routes and server-rendered pages.
export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-6 z-50">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="bg-card border border-border rounded-2xl p-8 sm:p-10 shadow-lg">

          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 text-accent flex items-center justify-center">
            <SearchX className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2">
            {t("notFound.title")}
          </h1>
          <p className="text-sm text-foreground/70 mb-8">{t("notFound.subtitle")}</p>

          <Link
            href="/"
            className="inline-flex items-center justify-center w-full bg-accent text-accent-foreground rounded-xl py-3 font-bold text-base transition-all hover:brightness-110 active:scale-[0.98]"
          >
            {t("notFound.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
