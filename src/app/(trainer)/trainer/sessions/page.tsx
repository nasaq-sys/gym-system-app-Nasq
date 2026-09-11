"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CalendarClock,
  User,
  Sparkles,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { formatLongDate, fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PrivateSession {
  id: string;
  memberName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  packageType: string;
  totalPrice: string;
  paidPrice: string;
  remainingPrice: string;
  paymentStatus: string;
}

function formatTime(raw: string, locale: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function TrainerSessionsPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [sessions, setSessions] = useState<PrivateSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trainer/sessions", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.data) setSessions(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalRemaining = useMemo(() => {
    return sessions.reduce((sum, s) => sum + (Number(s.remainingPrice) || 0), 0);
  }, [sessions]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Hero Banner for Sessions */}
      <div className="relative overflow-hidden rounded-3xl bg-card border border-border/80 p-5 sm:p-7 shadow-sm">

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/25">
              <CalendarClock className="w-3.5 h-3.5" />
              {isAr ? "التدريب الشخصي PT" : "Personal Training"}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {t("trainer.sessions.title")}
            </h1>
            <p className="text-xs sm:text-sm text-foreground/70">
              {t("trainer.sessions.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-background/60 backdrop-blur-md p-3.5 rounded-2xl border border-border/60">
            <div className="text-center px-2">
              <p className="text-xl font-black text-foreground tabular-nums">{sessions.length}</p>
              <p className="text-3xs text-foreground/70 font-medium mt-0.5">
                {isAr ? "إجمالي الجلسات" : "Sessions"}
              </p>
            </div>
            {totalRemaining > 0 && (
              <div className="text-center px-2 border-s border-border/50">
                <p className="text-xl font-black text-amber-400 tabular-nums">
                  {fmtCurrency(totalRemaining)}
                </p>
                <p className="text-3xs text-foreground/70 font-medium mt-0.5">
                  {isAr ? "متبقي تحصيله" : "Pending"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <Card className="text-center py-14">
          <CardContent>
            <CalendarClock className="w-12 h-12 text-foreground/70 mx-auto mb-3 opacity-50" />
            <p className="text-base font-bold text-foreground">{t("trainer.sessions.empty")}</p>
            <p className="text-xs text-foreground/70 mt-1">
              {isAr ? "لم يتم تسجيل أي جلسات تدريبية خاصة حالياً" : "No private sessions recorded"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => {
            const hasRemaining = Number(s.remainingPrice) > 0;
            const isPaid = s.paymentStatus === "مدفوع" || (!hasRemaining && Number(s.totalPrice) > 0);

            return (
              <div
                key={s.id}
                className="rounded-2xl border border-border/80 bg-card p-5 space-y-4 hover:border-primary/50 transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-accent text-sm shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground text-base truncate">
                          {s.memberName || "—"}
                        </h3>
                        <p className="text-xs text-foreground/70 truncate mt-0.5">
                          {s.packageType || s.type || "Personal Training"}
                        </p>
                      </div>
                    </div>

                    {s.type && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-bold bg-primary text-primary-foreground border border-primary/25 shrink-0">
                        {s.type}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-foreground/70 mt-4 flex-wrap bg-background p-2.5 rounded-xl border border-border/50">
                    <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold text-foreground">
                      {formatLongDate(s.date, locale)}
                    </span>
                    {(s.startTime || s.endTime) && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-foreground/70" />
                        {formatTime(s.startTime, locale)}
                        {s.endTime ? ` – ${formatTime(s.endTime, locale)}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {s.totalPrice && (
                      <span className="font-bold text-foreground">
                        {t("trainer.sessions.totalPrice")}:{" "}
                        <span className="text-accent font-black">{fmtCurrency(s.totalPrice)}</span>
                      </span>
                    )}
                    {hasRemaining && (
                      <span className="font-bold text-destructive">
                        {t("trainer.sessions.remaining")}: {fmtCurrency(s.remainingPrice)}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold border",
                      isPaid
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {s.paymentStatus || (isPaid ? (isAr ? "مدفوع بالكامل" : "Paid") : isAr ? "غير مدفوع" : "Unpaid")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
