"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from "recharts";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Ruler,
  MessageSquareText,
  TrendingDown,
  TrendingUp,
  Minus,
  Plus,
  X,
  UserCog,
  Check,
  Loader2,
  Trash2,
  Pencil,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FollowupItem {
  id: string;
  number?: number;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  waist: number | null;
  chest: number | null;
  arm: number | null;
  thigh: number | null;
  trainerNotes: string;
  memberNotes: string;
}

type TFunc = (path: string, params?: Record<string, string>) => string;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2.5 text-center border border-border/40">
      <p className="text-base font-extrabold text-foreground tabular-nums">
        {value != null ? value : "—"}
        {value != null && (
          <span className="text-2xs font-semibold text-foreground/70"> {unit}</span>
        )}
      </p>
      <p className="text-3xs text-foreground/70 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function FollowupCard({
  item,
  locale,
  t,
  canManage,
  onEdit,
  onDelete,
  isDeleting,
}: {
  item: FollowupItem;
  locale: string;
  t: TFunc;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-bold text-foreground">
            {formatLongDate(item.date, locale)}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title={t("followups.edit")}
              className="w-7 h-7"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={isDeleting}
              title={t("followups.delete")}
              className="w-7 h-7 text-foreground/70 hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatBox label={t("followups.weight")} value={item.weight} unit={t("followups.kg")} />
        <StatBox label={t("followups.bodyFat")} value={item.bodyFat} unit="%" />
        <StatBox label={t("followups.waist")} value={item.waist} unit={t("followups.cm")} />
      </div>

      {(item.chest != null || item.arm != null || item.thigh != null) && (
        <div className="grid grid-cols-3 gap-2">
          <StatBox label={t("followups.chest")} value={item.chest} unit={t("followups.cm")} />
          <StatBox label={t("followups.arm")} value={item.arm} unit={t("followups.cm")} />
          <StatBox label={t("followups.thigh")} value={item.thigh} unit={t("followups.cm")} />
        </div>
      )}

      {(item.trainerNotes || item.memberNotes) && (
        <div className="pt-2 border-t border-border/60 flex flex-col gap-1.5">
          {item.trainerNotes && (
            <p className="text-xs text-foreground/70 leading-relaxed flex items-start gap-1.5">
              <MessageSquareText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground">
                  {t("followups.trainerNotes")}:{" "}
                </span>
                {item.trainerNotes}
              </span>
            </p>
          )}
          {item.memberNotes && (
            <p className="text-xs text-foreground/70 leading-relaxed flex items-start gap-1.5">
              <MessageSquareText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-foreground/70" />
              <span>
                <span className="font-semibold text-foreground">
                  {t("followups.memberNotes")}:{" "}
                </span>
                {item.memberNotes}
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function FollowupsPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [managedByTrainer, setManagedByTrainer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: todayStr(),
    weight: "",
    bodyFat: "",
    waist: "",
    chest: "",
    arm: "",
    thigh: "",
    memberNotes: "",
  });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFollowups = useCallback(async () => {
    try {
      const res = await fetch("/api/followups", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Fetch failed");
      const json = await res.json();
      if (json?.data) {
        setItems(json.data.items || []);
        setManagedByTrainer(Boolean(json.data.managedByTrainer));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  const openAddForm = () => {
    setEditingId(null);
    setForm({
      date: todayStr(),
      weight: "",
      bodyFat: "",
      waist: "",
      chest: "",
      arm: "",
      thigh: "",
      memberNotes: "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (item: FollowupItem) => {
    setEditingId(item.id);
    setForm({
      date: item.date || todayStr(),
      weight: item.weight != null ? String(item.weight) : "",
      bodyFat: item.bodyFat != null ? String(item.bodyFat) : "",
      waist: item.waist != null ? String(item.waist) : "",
      chest: item.chest != null ? String(item.chest) : "",
      arm: item.arm != null ? String(item.arm) : "",
      thigh: item.thigh != null ? String(item.thigh) : "",
      memberNotes: item.memberNotes || "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.weight &&
      !form.bodyFat &&
      !form.waist &&
      !form.chest &&
      !form.arm &&
      !form.thigh &&
      !form.memberNotes
    ) {
      setFormError(t("followups.enterAtLeastOne"));
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/followups/${editingId}` : "/api/followups";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || t("followups.error"));
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      closeForm();
      await fetchFollowups();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("followups.error"));
    } finally {
      setFormSaving(false);
    }
  };

  const deleteFollowup = async (id: string) => {
    if (!window.confirm(t("followups.confirmDelete"))) return;
    setDeletingId(id);
    const prev = items;
    setItems((s) => s.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/followups/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setItems(prev);
      }
    } catch {
      setItems(prev);
    } finally {
      setDeletingId(null);
    }
  };

  const latest = items[0] ?? null;

  const weightTrend = useMemo(() => {
    const points = [...items]
      .filter((i) => i.weight != null)
      .reverse()
      .map((i, idx) => ({ i: idx, value: i.weight as number }));
    const change =
      points.length >= 2
        ? Math.round((points[points.length - 1].value - points[0].value) * 10) / 10
        : null;
    return { points, change };
  }, [items]);

  return (
    <div className="space-y-6 pb-12">
      {/* Desktop Hero Banner */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary text-primary-foreground font-bold">
              <Ruler className="w-3.5 h-3.5" />
              <span>{isAr ? "سجل القياسات والمتابعة الدورية" : "Body Composition & Measurements"}</span>
            </Badge>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("followups.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "تابع تطور وزنك، نسبة الدهون، ومحيط العضلات بدقة، واطلع على ملاحظات كابتنك الرياضي."
                : "Monitor weight trends, body fat %, muscle measurements, and coach feedback."}
            </p>
          </div>
          {!managedByTrainer && !loading && !error && (
            <Button
              onClick={openAddForm}
              className="gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t("followups.addFollowup")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex lg:hidden items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("followups.title")}</h1>
          <p className="text-sm text-foreground/70 mt-1">{t("followups.subtitle")}</p>
        </div>
        {!managedByTrainer && !loading && !error && (
          <Button
            size="sm"
            onClick={openAddForm}
            className="gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t("followups.addFollowup")}</span>
          </Button>
        )}
      </div>

      {/* Trainer Management Banner */}
      {managedByTrainer && (
        <div className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-4 py-3 border border-border/50">
          <UserCog className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-foreground/70">
            {t("followups.managedByTrainer")}
          </p>
        </div>
      )}

      {savedSuccess && (
        <Alert className="border-success/30 bg-success/10 text-success">
          <Check className="w-4 h-4 text-success" />
          <AlertDescription className="text-xs font-bold text-success">
            {t("followups.saved")}
          </AlertDescription>
        </Alert>
      )}

      {/* Add / Edit Form Modal / Inline Card */}
      {showForm && !managedByTrainer && (
        <Card className="p-5 border-primary/40 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Ruler className="w-4 h-4 text-primary" />
              <span>{editingId ? t("followups.editFollowup") : t("followups.newFollowup")}</span>
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeForm}
              className="w-7 h-7 text-foreground/70 hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {formError && (
            <Alert className="border-destructive/30 bg-destructive/10 text-destructive text-xs">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={submitForm} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1">
                {t("followups.date")}
              </label>
              <Input
                type="date"
                dir="ltr"
                value={form.date}
                max={todayStr()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.weight")} ({t("followups.kg")})
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="20"
                  max="350"
                  placeholder="e.g. 75.5"
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.bodyFat")} (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="3"
                  max="60"
                  placeholder="e.g. 15.0"
                  value={form.bodyFat}
                  onChange={(e) => setForm((f) => ({ ...f, bodyFat: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.waist")} ({t("followups.cm")})
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="30"
                  max="200"
                  placeholder="e.g. 80"
                  value={form.waist}
                  onChange={(e) => setForm((f) => ({ ...f, waist: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.chest")} ({t("followups.cm")})
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="40"
                  max="200"
                  placeholder="e.g. 100"
                  value={form.chest}
                  onChange={(e) => setForm((f) => ({ ...f, chest: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.arm")} ({t("followups.cm")})
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="15"
                  max="80"
                  placeholder="e.g. 36"
                  value={form.arm}
                  onChange={(e) => setForm((f) => ({ ...f, arm: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">
                  {t("followups.thigh")} ({t("followups.cm")})
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="20"
                  max="120"
                  placeholder="e.g. 55"
                  value={form.thigh}
                  onChange={(e) => setForm((f) => ({ ...f, thigh: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1">
                {t("followups.memberNotes")} ({t("followups.optional")})
              </label>
              <Textarea
                rows={2}
                value={form.memberNotes}
                onChange={(e) => setForm((f) => ({ ...f, memberNotes: e.target.value }))}
                placeholder={t("followups.notesPlaceholder")}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={formSaving}
                className="flex-1 gap-2"
              >
                {formSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{formSaving ? t("followups.saving") : t("followups.save")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
              >
                {t("followups.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : error ? (
        <Card>
          <CardContent>
            <p className="text-foreground/70 text-sm text-center py-8">{t("followups.error")}</p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Ruler className="w-8 h-8 text-primary" />
            </div>
            <p className="text-foreground/70 text-sm max-w-sm text-center">{t("followups.none")}</p>
            {!managedByTrainer && (
              <Button
                type="button"
                onClick={openAddForm}
                className="mt-2 gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{t("followups.addFollowup")}</span>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Latest snapshot */}
          <Card>
            <CardHeader
              title={t("followups.latest")}
              action={
                latest ? (
                  <span className="text-2xs text-foreground/70">
                    {formatLongDate(latest.date, locale)}
                  </span>
                ) : undefined
              }
            />
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label={t("followups.weight")} value={latest?.weight ?? null} unit={t("followups.kg")} />
                <StatBox label={t("followups.bodyFat")} value={latest?.bodyFat ?? null} unit="%" />
                <StatBox label={t("followups.waist")} value={latest?.waist ?? null} unit={t("followups.cm")} />
                <StatBox label={t("followups.chest")} value={latest?.chest ?? null} unit={t("followups.cm")} />
                <StatBox label={t("followups.arm")} value={latest?.arm ?? null} unit={t("followups.cm")} />
                <StatBox label={t("followups.thigh")} value={latest?.thigh ?? null} unit={t("followups.cm")} />
              </div>
            </CardContent>
          </Card>

          {/* Weight trend */}
          <Card>
            <CardHeader
              title={t("followups.weightTrend")}
              action={
                weightTrend.change != null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-2xs font-bold tabular-nums",
                      weightTrend.change < 0
                        ? "text-success"
                        : weightTrend.change > 0
                          ? "text-destructive"
                          : "text-foreground/70"
                    )}
                    dir="ltr"
                  >
                    {weightTrend.change < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5" />
                    ) : weightTrend.change > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <Minus className="w-3.5 h-3.5" />
                    )}
                    {weightTrend.change > 0 ? "+" : ""}
                    {weightTrend.change} {t("followups.kg")}
                  </span>
                ) : undefined
              }
            />
            <CardContent>
              {weightTrend.points.length >= 2 ? (
                <div className="h-32 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightTrend.points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: 10,
                          fontSize: 11,
                          color: "hsl(var(--card-foreground))",
                        }}
                        labelFormatter={() => ""}
                        formatter={(value) => [`${value} ${t("followups.kg")}`, t("followups.weight")] as [string, string]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-14 w-full flex items-center gap-3 rounded-xl bg-muted/30 border border-dashed border-border px-3">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
                  <span className="text-2xs text-foreground/70 leading-snug">
                    {t("followups.needMoreData")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-foreground">{t("followups.history")}</h2>
            <div className="space-y-3">
              {items.map((f) => (
                <FollowupCard
                  key={f.id}
                  item={f}
                  locale={locale}
                  t={t}
                  canManage={!managedByTrainer}
                  onEdit={() => openEditForm(f)}
                  onDelete={() => deleteFollowup(f.id)}
                  isDeleting={deletingId === f.id}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
