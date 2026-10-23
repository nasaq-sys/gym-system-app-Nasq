"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, QrCode, RefreshCw } from "lucide-react";
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
  const [checkedIn, setCheckedIn] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const recentPasses = useRef<AttendancePass[]>([]);

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
        recentPasses.current = [next, ...recentPasses.current.filter((item) => item.token !== next.token && item.expiresAt + 60 > Date.now() / 1000)].slice(0, 3);
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
    if (checkedIn) return;
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
  }, [refresh, checkedIn]);

  useEffect(() => {
    if (!pass || checkedIn) return;
    const delay = Math.max(0, pass.expiresAt * 1000 - Date.now() + 100);
    const timer = window.setTimeout(() => {
      if (!document.hidden) void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [pass, refresh, checkedIn]);

  useEffect(() => {
    if (!pass || checkedIn) return;
    const controller = new AbortController();
    let pending = false;
    let failures = 0;
    const poll = async () => {
      if (document.hidden || pending || controller.signal.aborted) return;
      pending = true;
      try {
        const tokens = recentPasses.current.filter((item) => item.expiresAt + 60 > Date.now() / 1000).map((item) => item.token);
        if (!tokens.length) return;
        const response = await fetch("/api/member-qr/status", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens }),
        });
        if (!response.ok) throw new Error("Check-in status failed");
        const result = (await response.json()) as { checkedIn: boolean };
        failures = 0;
        setStatusError(false);
        if (result.checkedIn) {
          setCheckedIn(true);
          setPass(null);
        }
      } catch {
        if (!controller.signal.aborted && ++failures >= 3) setStatusError(true);
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1_500);
    const visible = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pass, checkedIn, statusRetry]);

  const matrix = useMemo(() => {
    if (!pass) return null;
    try { return encodeMemberQr(pass.token); } catch { return null; }
  }, [pass]);
  const path = useMemo(() => matrix?.flatMap((row, y) => row.flatMap((black, x) =>
    black ? [`M${x} ${y}h1v1h-1z`] : []
  )).join("") ?? "", [matrix]);
  const remaining = pass ? Math.max(0, pass.expiresAt - now) : 0;
  const visibleMatrix = remaining > 0 && !checkedIn ? matrix : null;

  if (checkedIn) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite">
          <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold text-foreground">{t("profile.qrSuccessTitle")}</h2>
          <p className="text-sm text-foreground/70">{t("profile.qrSuccessDescription")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="flex items-center justify-center gap-2 text-base font-bold text-foreground sm:justify-start">
            <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("profile.qrTitle")}
          </h2>
          <p className="text-xs text-foreground/70">{t("profile.qrInstructions")}</p>
          {visibleMatrix && <p className="text-xs font-semibold text-primary">{t("profile.qrRefreshIn")} {remaining} {t("profile.qrSeconds")}</p>}
          {statusError && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-foreground/70 sm:justify-start" role="alert">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <span>{t("profile.qrStatusUnavailable")}</span>
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => { setStatusError(false); setStatusRetry((value) => value + 1); }}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("profile.qrRetry")}
              </Button>
            </div>
          )}
          {(error || (!loading && !visibleMatrix)) && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-foreground/70 sm:justify-start" role="status">
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
              <span>{t("profile.qrUnavailable")}</span>
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> {t("profile.qrRetry")}
              </Button>
            </div>
          )}
        </div>
        {visibleMatrix ? (
          <div className="w-full max-w-80 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border sm:w-64 sm:shrink-0 lg:w-72" dir="ltr">
            <svg viewBox="0 0 57 57" className="block aspect-square w-full" shapeRendering="crispEdges" role="img" aria-label={t("profile.qrImageLabel")}>
              <rect width="57" height="57" fill="white" />
              <path d={path} fill="black" />
            </svg>
          </div>
        ) : loading ? <Skeleton className="h-72 w-full max-w-80 shrink-0 rounded-2xl sm:w-64" /> : null}
      </CardContent>
    </Card>
  );
}
