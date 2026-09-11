"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  PackageSearch,
  CircleDot,
  CheckCircle2,
  MapPin,
  CalendarDays,
  Send,
  Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";
import ArabicDatePicker from "@/components/shared/ArabicDatePicker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { translateLostFoundText } from "@/lib/lostFoundTranslate";

interface Report {
  id: string;
  number?: number;
  type?: string;
  itemName?: string;
  description?: string;
  location?: string;
  date?: string;
  status?: string;
  receiver?: string;
  receivedDate?: string;
  createdTime: string;
  isMine?: boolean;
}

export default function LostFoundPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [form, setForm] = useState({
    type: "مفقودات",
    itemName: "",
    description: "",
    location: "",
    date: "",
  });

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/lost-found", { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.data) setReports(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lost-found", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.data) setReports(data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("focus") !== "report") return;
    const timeout = setTimeout(() => {
      document.getElementById("report-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => clearTimeout(timeout);
  }, []);

  const foundOnly = reports.filter((r) => r.type === "معثورات" || r.type === "معثور" || r.type === "found");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/lost-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...form }),
      });
      if (!res.ok) throw new Error("Failed");
      setForm({ type: "مفقودات", itemName: "", description: "", location: "", date: "" });
      setMessage({ type: "ok", text: t("lostFound.reportSuccess") });
      await fetchReports();
    } catch {
      setMessage({ type: "err", text: t("lostFound.reportError") });
    } finally {
      setSubmitting(false);
    }
  };

  const isClaimed = (r: Report) =>
    r.status === "تم التسليم" ||
    r.status === "Delivered" ||
    r.status === "claimed" ||
    r.status === "تم التسليم بنجاح";

  const statusBadge = (r: Report) => {
    const claimed = isClaimed(r);
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 font-semibold text-2xs",
          claimed
            ? "border-primary/30 bg-primary text-primary-foreground"
            : "border-blue-500/30 bg-blue-500/10 text-blue-400"
        )}
      >
        {claimed ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <Clock className="w-3 h-3" />
        )}
        <span>{claimed ? t("lostFound.status_claimed") : t("lostFound.status_pending")}</span>
      </Badge>
    );
  };

  const typeBadge = (r: Report) => {
    const isLost = r.type === "مفقودات" || r.type === "lost";
    return (
      <Badge
        variant="outline"
        className={cn(
          "font-bold text-2xs",
          isLost
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
        )}
      >
        {isLost ? t("lostFound.type_lost") : t("lostFound.type_found")}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("lostFound.title")}
        </h1>
        <p className="text-sm text-foreground/70 mt-1">{t("lostFound.subtitle")}</p>
      </div>

      {message && (
        <Alert
          className={cn(
            message.type === "ok"
              ? "border-primary/30 bg-primary text-primary-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Report form */}
        <div id="report-form" className="lg:col-span-1 h-fit scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle>{t("lostFound.reportItem")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
                    {t("lostFound.type")}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={form.type === "مفقودات" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, type: "مفقودات" }))}
                      className={cn(
                        "text-xs",
                        form.type === "مفقودات" && "font-bold shadow-sm"
                      )}
                    >
                      {t("lostFound.type_lost")}
                    </Button>
                    <Button
                      type="button"
                      variant={form.type === "معثورات" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, type: "معثورات" }))}
                      className={cn(
                        "text-xs",
                        form.type === "معثورات" && "font-bold shadow-sm"
                      )}
                    >
                      {t("lostFound.type_found")}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
                    {t("lostFound.itemName")} *
                  </label>
                  <Input
                    required
                    value={form.itemName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, itemName: e.target.value }))
                    }
                    placeholder={
                      isAr
                        ? "مثال: ساعة ذكية سوداء، مفتاح خزانة..."
                        : "e.g. Black smartwatch, locker key..."
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
                    {t("lostFound.description")}
                  </label>
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder={
                      isAr
                        ? "تفاصيل إضافية مثل اللون، الماركة، أو علامات مميزة..."
                        : "Additional details such as color, brand, or markings..."
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
                    {t("lostFound.location")}
                  </label>
                  <Input
                    value={form.location}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, location: e.target.value }))
                    }
                    placeholder={t("lostFound.locationPlaceholder")}
                  />
                </div>

                <div>
                  <ArabicDatePicker
                    label={t("lostFound.date")}
                    value={form.date}
                    onChange={(dateStr) => setForm((f) => ({ ...f, date: dateStr }))}
                    placeholder={t("lostFound.datePlaceholder")}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full gap-2 font-bold cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {submitting
                      ? t("lostFound.submitting")
                      : t("lostFound.submit")}
                  </span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Reports list */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : foundOnly.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                <PackageSearch className="w-10 h-10 text-foreground/70" />
                <p className="text-foreground/70 text-sm">{t("lostFound.emptyList")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {foundOnly.map((r) => {
                const targetLang = isAr ? "ar" : "en";
                const displayItemName = translateLostFoundText(r.itemName, targetLang) || (isAr ? "غرض معثور" : "Found Item");
                const displayDescription = translateLostFoundText(r.description, targetLang);
                const displayLocation = translateLostFoundText(r.location, targetLang);

                return (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                          r.type === "مفقودات" || r.type === "lost"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-400"
                        )}
                      >
                        <CircleDot className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-foreground text-sm truncate">
                            {displayItemName}
                          </h4>
                          {typeBadge(r)}
                          {statusBadge(r)}
                          {r.isMine && (
                            <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400 text-3xs">
                              {t("lostFound.myReportBadge")}
                            </Badge>
                          )}
                        </div>
                        {displayDescription && (
                          <p className="text-sm text-foreground/70 mt-1.5 leading-relaxed">
                            {displayDescription}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs text-foreground/70">
                          {displayLocation && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-foreground/70" />
                              <span className="truncate">{displayLocation}</span>
                            </span>
                          )}
                          {r.date && (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <CalendarDays className="w-3.5 h-3.5 shrink-0 text-foreground/70" />
                              <span className="truncate">{formatLongDate(r.date, locale)}</span>
                            </span>
                          )}
                          {isClaimed(r) && r.receiver && (
                            <span className="bg-muted/50 border border-border/50 px-2 py-0.5 rounded-md text-2xs">
                              {t("lostFound.claimedTag")}: <b className="text-foreground">{r.receiver}</b>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
