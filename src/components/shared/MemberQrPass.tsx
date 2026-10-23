"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, QrCode, RefreshCw } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { encodeMemberQr } from "@/lib/memberQr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AttendancePass {
  token: string;
  expiresAt: number;
}

/** Draws the server-signed attendance pass as a local SVG, without a QR image API. */
export default function MemberQrPass() {
  const { t } = useI18n();
  const [pass, setPass] = useState<AttendancePass | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!signal?.aborted) setLoading(true);
    try {
      const response = await fetch("/api/member-qr", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("QR issuance failed");
      const next = (await response.json()) as AttendancePass;
      if (!next.token || !Number.isFinite(next.expiresAt)) throw new Error("Invalid QR response");
      if (!signal?.aborted) {
        setPass(next);
        setError(false);
      }
    } catch {
      if (!signal?.aborted) {
        setPass(null);
        setError(true);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const clock = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    const visible = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!pass) return;
    const delay = Math.max(0, pass.expiresAt * 1000 - Date.now() + 100);
    const timer = window.setTimeout(() => {
      if (!document.hidden) void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [pass, refresh]);

  const matrix = useMemo(() => {
    if (!pass || pass.expiresAt <= now) return null;
    try { return encodeMemberQr(pass.token); } catch { return null; }
  }, [pass, now]);
  const path = useMemo(() => matrix?.flatMap((row, y) => row.flatMap((black, x) =>
    black ? [`M${x} ${y}h1v1h-1z`] : []
  )).join("") ?? "", [matrix]);
  const remaining = pass ? Math.max(0, pass.expiresAt - now) : 0;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="flex items-center justify-center gap-2 text-base font-bold text-foreground sm:justify-start">
            <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("profile.qrTitle")}
          </h2>
          <p className="text-xs text-foreground/70">{t("profile.qrInstructions")}</p>
          {matrix && <p className="text-xs font-semibold text-primary">{t("profile.qrRefreshIn")} {remaining} {t("profile.qrSeconds")}</p>}
          {(error || (!loading && !matrix)) && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-foreground/70 sm:justify-start" role="status">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <span>{t("profile.qrUnavailable")}</span>
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("profile.qrRetry")}
              </Button>
            </div>
          )}
        </div>
        {matrix ? (
          <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border" dir="ltr">
            <svg viewBox="0 0 65 65" className="block h-52 w-52 max-w-full sm:h-56 sm:w-56" shapeRendering="crispEdges" role="img" aria-label={t("profile.qrImageLabel")}>
              <rect width="65" height="65" fill="white" />
              <path d={path} fill="black" />
            </svg>
          </div>
        ) : loading ? <Skeleton className="h-56 w-56 shrink-0 rounded-2xl" /> : null}
      </CardContent>
    </Card>
  );
}
