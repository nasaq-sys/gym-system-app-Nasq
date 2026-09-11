"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  CreditCard,
  FlaskConical,
  ShieldCheck,
  User,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";

interface DemoTransactionData {
  transactionId: string;
  memberName: string;
  memberEmail: string;
  planId: string;
  planName: string;
  planNameEn: string;
  amount: number;
  currency: string;
  durationDays: number;
  status: string;
}

export default function DemoCheckoutPage(props: {
  params: Promise<{ transactionId: string }>;
}) {
  const params = use(props.params);
  const transactionId = params.transactionId;
  const router = useRouter();
  const { locale } = useI18n();
  const isAr = locale === "ar";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DemoTransactionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<"success" | "fail" | "cancel" | null>(
    null
  );

  useEffect(() => {
    fetch(`/api/payments/demo/${transactionId}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData?.success && resData?.data) {
          setData(resData.data);
        } else {
          setError(
            resData?.message ||
              (isAr ? "تعذر العثور على جلسة الدفع." : "Payment session not found.")
          );
        }
      })
      .catch(() => {
        setError(isAr ? "حدث خطأ أثناء تحميل جلسة الدفع." : "Error loading payment session.");
      })
      .finally(() => setLoading(false));
  }, [transactionId, isAr]);

  const handleAction = async (action: "success" | "fail" | "cancel") => {
    setSubmittingAction(action);
    setError(null);

    try {
      const res = await fetch("/api/payments/demo/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          action,
        }),
      });

      const resData = await res.json();

      if (resData?.data?.redirectUrl) {
        router.push(resData.data.redirectUrl);
      } else {
        router.push(`/payment/result?ref=${transactionId}`);
      }
    } catch {
      setError(
        isAr
          ? "حدث خطأ أثناء تنفيذ المحاكاة. حاول مرة أخرى."
          : "Error executing simulation. Please try again."
      );
      setSubmittingAction(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-foreground">
            {isAr ? "جاري تحميل جلسة الدفع التجريبي..." : "Loading Demo Checkout..."}
          </h2>
          <p className="text-xs text-foreground/60 max-w-sm">
            {isAr
              ? "تحضير واجهة محاكاة الدفع الداخلي لـ Nasaq Gym."
              : "Preparing Nasaq Gym internal payment simulator."}
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 space-y-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-foreground">
          {isAr ? "تعذر تحميل جلسة الدفع" : "Failed to Load Session"}
        </h2>
        <p className="text-xs text-foreground/70">{error}</p>
        <div className="pt-2">
          <Link
            href="/profile"
            className={cn(buttonVariants({ variant: "outline" }), "rounded-2xl text-xs")}
          >
            {isAr ? "العودة للملف الشخصي" : "Back to Profile"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-6 px-4 space-y-5">
      {/* Header Badge */}
      <div className="text-center space-y-1">
        <Badge
          variant="outline"
          className="px-3 py-1 text-2xs font-black bg-amber-500/10 text-amber-500 border-amber-500/30 rounded-full inline-flex items-center gap-1.5"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>{isAr ? "بوابة الدفع التجريبي — Nasaq Gym" : "Nasaq Gym Demo Payment Gateway"}</span>
        </Badge>
        <h1 className="text-xl font-black text-foreground pt-1">
          {isAr ? "محاكاة الدفع الإلكتروني" : "Payment Simulation"}
        </h1>
        <p className="text-xs text-foreground/60">
          {isAr
            ? "اختبار دورة تجديد الاشتراك بالكامل دون الحاجة لبطاقات بنكية حقيقية"
            : "Test subscription renewal flow without real bank cards"}
        </p>
      </div>

      {/* Invoice Card */}
      <Card className="rounded-3xl border-border/80 shadow-2xl bg-card overflow-hidden">
        <CardContent className="p-5 space-y-4">
          {/* Amount Header */}
          <div className="rounded-2xl bg-primary/10 border border-primary/20 p-4 text-center space-y-1">
            <p className="text-2xs font-semibold text-foreground/70">
              {isAr ? "المبلغ الإجمالي للاشتراك" : "Total Subscription Amount"}
            </p>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-3xl font-black text-primary tabular-nums">
                {data.amount.toFixed(3)}
              </span>
              <span className="text-xs font-bold text-foreground/80">
                {isAr ? "دينار أردني" : "JOD"}
              </span>
            </div>
            <p className="text-3xs font-medium text-foreground/60">
              {isAr ? data.planName : data.planNameEn} • {data.durationDays}{" "}
              {isAr ? "يوماً" : "days"}
            </p>
          </div>

          {/* Member & Order Details */}
          <div className="divide-y divide-border/40 text-xs space-y-0">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" />
                {isAr ? "اسم المتدرب:" : "Member Name:"}
              </span>
              <span className="font-bold text-foreground">{data.memberName}</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                {isAr ? "الخطة المطلوبة:" : "Plan:"}
              </span>
              <span className="font-semibold text-foreground">
                {isAr ? data.planName : data.planNameEn}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-foreground/70">{isAr ? "رقم الحركة:" : "Ref ID:"}</span>
              <span className="font-mono text-3xs text-foreground/70">{data.transactionId}</span>
            </div>
          </div>

          {/* Notice Box */}
          <div className="rounded-2xl bg-muted/60 border border-border/60 p-3 text-3xs text-foreground/70 flex items-start gap-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {isAr
                ? "هذه بيئة تجريبية داخلية لنظام Nasaq Gym. يمكنك الضغط على أي من الخيارات أدناه لاختبار رد فعل النظام وتحديث الاشتراك وإرسال الإشعارات."
                : "This is an internal Nasaq Gym demo environment. Click any option below to simulate system behavior, subscription updates, and alerts."}
            </p>
          </div>

          {/* Simulation Action Buttons */}
          <div className="space-y-2.5 pt-2">
            {/* 1. Simulate Success */}
            <Button
              onClick={() => handleAction("success")}
              disabled={submittingAction !== null}
              className="w-full h-12 rounded-2xl font-black text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 gap-2"
            >
              {submittingAction === "success" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isAr ? "جاري تسجيل الدفع وتجديد الاشتراك..." : "Fulfilling Renewal..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? "محاكاة دفع ناجح (Simulate Success)" : "Simulate Successful Payment"}</span>
                  <Sparkles className="w-3.5 h-3.5 opacity-70" />
                </>
              )}
            </Button>

            {/* 2. Simulate Failure */}
            <Button
              onClick={() => handleAction("fail")}
              disabled={submittingAction !== null}
              variant="outline"
              className="w-full h-11 rounded-2xl font-bold text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-2"
            >
              {submittingAction === "fail" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isAr ? "جاري محاكاة فشل الدفع..." : "Simulating Failure..."}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>{isAr ? "محاكاة فشل الدفع (Simulate Failure)" : "Simulate Payment Failure"}</span>
                </>
              )}
            </Button>

            {/* 3. Cancel */}
            <Button
              onClick={() => handleAction("cancel")}
              disabled={submittingAction !== null}
              variant="ghost"
              className="w-full h-10 rounded-2xl font-semibold text-xs text-foreground/60 hover:text-foreground hover:bg-muted/50 gap-1.5"
            >
              <span>{isAr ? "إلغاء العملية والعودة (Cancel)" : "Cancel Simulation"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
