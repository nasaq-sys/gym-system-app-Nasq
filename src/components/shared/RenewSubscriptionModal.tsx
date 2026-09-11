"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Calendar,
  Loader2,
  AlertCircle,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  Zap,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";
import type { MembershipPlan } from "@/lib/membershipPlans";

interface RenewSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlanName?: string;
  currentSubEndDate?: string;
}

export default function RenewSubscriptionModal({
  open,
  onOpenChange,
  currentPlanName,
  currentSubEndDate,
}: RenewSubscriptionModalProps) {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [fetchingPlans, setFetchingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dynamic packages from Airtable via /api/payments/plans
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setFetchingPlans(true);

    fetch("/api/payments/plans")
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res?.data) && res.data.length > 0) {
          const list: MembershipPlan[] = res.data;
          setPlans(list);
          // Pre-select popular plan or the 3-month / monthly plan
          const popular = list.find((p) => p.popular) || list[1] || list[0];
          setSelectedPlanId(popular.id);
        }
      })
      .catch((err) => {
        console.error("Error fetching packages:", err);
      })
      .finally(() => {
        if (!cancelled) setFetchingPlans(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedPlan =
    plans.find((p) => p.id === selectedPlanId) ||
    plans[0] || {
      id: "monthly",
      nameAr: "باقة شهرية",
      nameEn: "Monthly Package",
      durationDays: 30,
      durationMonths: 1,
      price: 40.0,
      currency: "JOD" as const,
      featuresAr: [],
      featuresEn: [],
    };

  // Calculate preview new expiry date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let baseDate = today;
  if (currentSubEndDate) {
    const currentEnd = new Date(currentSubEndDate + "T00:00:00");
    if (!isNaN(currentEnd.getTime()) && currentEnd.getTime() > today.getTime()) {
      baseDate = currentEnd;
    }
  }

  const previewEndDate = new Date(baseDate.getTime());
  previewEndDate.setDate(previewEndDate.getDate() + (selectedPlan.durationDays || 30));
  const previewEndDateStr = previewEndDate.toISOString().slice(0, 10);

  const handlePayOnline = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan.id }),
      });

      const data = await res.json();

      if (res.ok && data?.success && data?.data?.paymentUrl) {
        window.location.assign(data.data.paymentUrl);
      } else {
        setError(
          data?.message ||
            (isAr
              ? "تعذر بدء عملية الدفع حالياً. يرجى المحاولة مرة أخرى."
              : "Failed to initiate payment. Please try again.")
        );
        setLoading(false);
      }
    } catch {
      setError(
        isAr
          ? "تعذر بدء عملية الدفع حالياً. يرجى المحاولة مرة أخرى."
          : "Network error. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[94vw] max-h-[92vh] overflow-y-auto rounded-3xl p-5 sm:p-6 bg-card border-border/80 shadow-2xl no-scrollbar">
        {/* Header */}
        <DialogHeader className="text-start space-y-2 pb-1 border-b border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center text-primary shadow-inner">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                    {isAr ? "تجديد الاشتراك" : "Renew Membership"}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className="px-2 py-0.5 text-3xs font-black bg-amber-500/10 text-amber-500 border-amber-500/25 rounded-full flex items-center gap-1"
                  >
                    <FlaskConical className="w-2.5 h-2.5" />
                    <span>{isAr ? "تجريبي" : "TEST"}</span>
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-foreground/65 leading-relaxed">
                  {isAr
                    ? "اختر الباقة المناسبة لتمديد عضويتك فورياً بأمان"
                    : "Choose your plan to extend your membership securely"}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Current Subscription Status Strip */}
        <div className="rounded-2xl bg-gradient-to-r from-muted/60 via-muted/30 to-muted/60 p-3.5 border border-border/60">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-3xs font-semibold text-foreground/60 block">
                {isAr ? "الاشتراك الحالي" : "Current Plan"}
              </span>
              <span className="font-bold text-foreground block truncate">
                {currentPlanName || (isAr ? "اشتراك Nasaq Gym" : "Nasaq Gym Plan")}
              </span>
            </div>
            {currentSubEndDate && (
              <div className="space-y-1 text-end">
                <span className="text-3xs font-semibold text-foreground/60 block">
                  {isAr ? "تاريخ الانتهاء الحالي" : "Current Expiry"}
                </span>
                <span className="font-bold text-foreground block">
                  {formatLongDate(currentSubEndDate, locale)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Plan Selection Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>{isAr ? "اختر باقة التجديد:" : "Select Renewal Package:"}</span>
            </label>
            <span className="text-3xs text-foreground/60">
              {isAr ? "تفعيل فوري بعد الدفع" : "Instant Activation"}
            </span>
          </div>

          {fetchingPlans ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center text-foreground/70">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <p className="text-xs font-medium">
                {isAr ? "جاري تحميل الباقات المتاحة..." : "Loading available packages..."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {plans.map((p, idx) => {
                const isSelected = p.id === selectedPlanId;
                const isOddLast = plans.length % 2 !== 0 && idx === plans.length - 1;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlanId(p.id)}
                    className={cn(
                      "p-3.5 rounded-2xl border text-start transition-all relative flex flex-col justify-between gap-3 cursor-pointer select-none",
                      isOddLast ? "col-span-2 sm:col-span-1" : "col-span-1",
                      isSelected
                        ? "border-primary bg-gradient-to-br from-primary/15 via-primary/5 to-transparent ring-2 ring-primary/40 shadow-md shadow-primary/10 -translate-y-0.5"
                        : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border active:scale-[0.99]"
                    )}
                  >
                    {/* Badge */}
                    {p.popular && (
                      <span className="absolute -top-2.5 end-2.5 px-2 py-0.5 text-3xs font-black bg-primary text-primary-foreground rounded-full shadow-sm">
                        {isAr ? "الأكثر طلباً ⭐" : "Popular ⭐"}
                      </span>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-foreground leading-tight">
                          {isAr ? p.nameAr : p.nameEn}
                        </p>
                        <p className="text-3xs font-medium text-foreground/60 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-primary/70" />
                          <span>{isAr ? `${p.durationDays} يوماً` : `${p.durationDays} days`}</span>
                        </p>
                      </div>

                      {/* Radio Checkmark */}
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-background"
                        )}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 pt-2 border-t border-border/40">
                      <span className="text-lg sm:text-xl font-black text-primary tabular-nums tracking-tight">
                        {p.price.toFixed(3)}
                      </span>
                      <span className="text-3xs font-bold text-foreground/70">
                        {isAr ? "د.أ" : "JOD"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Renewal Summary Card */}
        {!fetchingPlans && (
          <div className="rounded-2xl bg-gradient-to-b from-primary/10 via-primary/5 to-card border border-primary/20 p-4 space-y-2.5 text-xs shadow-inner">
            <div className="font-bold text-foreground text-xs pb-2 border-b border-primary/15 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>{isAr ? "ملخص عملية التجديد" : "Renewal Summary"}</span>
              </span>
              <span className="text-3xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-black">
                {isAr ? "تفعيل تلقائي" : "Auto Activated"}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-foreground/80">
                <span className="text-foreground/65">{isAr ? "الباقة المختارة:" : "Selected Plan:"}</span>
                <span className="font-bold text-foreground">
                  {isAr ? selectedPlan.nameAr : selectedPlan.nameEn}
                </span>
              </div>

              <div className="flex items-center justify-between text-foreground/80">
                <span className="text-foreground/65">{isAr ? "فترة التمديد:" : "Extension Period:"}</span>
                <span className="font-semibold text-foreground">
                  {isAr ? `${selectedPlan.durationDays} يوماً إضافياً` : `+${selectedPlan.durationDays} extra days`}
                </span>
              </div>

              <div className="flex items-center justify-between text-foreground/80">
                <span className="text-foreground/65">{isAr ? "تاريخ الانتهاء الجديد:" : "New Expiry Date:"}</span>
                <span className="font-bold text-emerald-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatLongDate(previewEndDateStr, locale)}</span>
                </span>
              </div>
            </div>

            {/* Total Row */}
            <div className="flex items-center justify-between pt-2.5 border-t border-primary/20">
              <span className="font-black text-sm text-foreground">
                {isAr ? "المبلغ الإجمالي:" : "Total Amount:"}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-black text-primary tabular-nums">
                  {selectedPlan.price.toFixed(3)}
                </span>
                <span className="text-xs font-bold text-primary">
                  {isAr ? "دينار أردني" : "JOD"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/25 p-3.5 text-xs text-destructive flex items-center gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="leading-snug font-medium">{error}</p>
          </div>
        )}

        {/* Action Button & Security Assurance */}
        <div className="space-y-2.5 pt-1">
          <Button
            onClick={handlePayOnline}
            disabled={loading || fetchingPlans}
            className="w-full h-12 rounded-2xl font-black text-sm bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/25 gap-2 cursor-pointer transition-all active:scale-[0.99]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isAr ? "جاري تحضير بوابة الدفع..." : "Preparing Gateway..."}</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>
                  {isAr
                    ? `متابعة إلى الدفع (${selectedPlan.price.toFixed(3)} د.أ)`
                    : `Proceed to Payment (${selectedPlan.price.toFixed(3)} JOD)`}
                </span>
                <ArrowIcon className="w-4 h-4 opacity-80" />
              </>
            )}
          </Button>

          <div className="flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-3xs text-amber-500/90 font-semibold flex items-center justify-center gap-1">
              <FlaskConical className="w-3 h-3" />
              <span>
                {isAr
                  ? "بيئة اختبار تجريبية: لن يتم خصم أي أموال حقيقية."
                  : "Sandbox Mode: No real funds will be charged."}
              </span>
            </p>

            <p className="text-3xs text-foreground/50 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>
                {isAr
                  ? "بوابة دفع إلكتروني مشفرة وآمنة عبر MyFatoorah"
                  : "Encrypted & secure payment powered by MyFatoorah"}
              </span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
