"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  User,
  Home,
  RotateCcw,
  FlaskConical,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLongDate } from "@/lib/format";
import RenewSubscriptionModal from "@/components/shared/RenewSubscriptionModal";

interface VerificationData {
  status: "paid" | "failed" | "cancelled" | "amount_mismatch";
  alreadyFulfilled?: boolean;
  newExpiryDate?: string;
  newStartDate?: string;
  planName?: string;
  amount?: number;
  currency?: string;
  transactionRef?: string;
  invoiceId?: number | string;
  error?: string;
}

/* ─────────────────────────────────────────────────────────────
   Animated Success Circle & Checkmark
   ───────────────────────────────────────────────────────────── */
function AnimatedSuccessCheckmark() {
  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto my-2">
      {/* Outer Glowing Ripple Rings */}
      <span
        className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/25 opacity-75 animate-ping"
        style={{ animationDuration: "2.2s" }}
      />
      <span className="absolute -inset-2 rounded-full bg-emerald-500/15 animate-pulse" />
      <span className="absolute -inset-4 rounded-full bg-emerald-500/5 animate-pulse" style={{ animationDuration: "3s" }} />

      {/* Main Animated Circle */}
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/30 via-emerald-500/15 to-emerald-500/5 border-2 border-emerald-500/60 flex items-center justify-center shadow-2xl shadow-emerald-500/30 backdrop-blur-sm animate-in zoom-in-50 duration-500">
        <svg
          className="w-14 h-14 text-emerald-400 stroke-current drop-shadow-md"
          viewBox="0 0 52 52"
          fill="none"
        >
          {/* Animated Circle Border */}
          <circle
            cx="26"
            cy="26"
            r="23"
            strokeWidth="3.2"
            strokeLinecap="round"
            style={{
              strokeDasharray: 150,
              strokeDashoffset: 150,
              animation: "dashSuccessCircle 0.65s cubic-bezier(0.65, 0, 0.45, 1) forwards",
            }}
          />
          {/* Animated Checkmark Path */}
          <path
            d="M14 27 L22.5 35.5 L38 18"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 45,
              strokeDashoffset: 45,
              animation: "dashSuccessCheck 0.45s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards",
            }}
          />
        </svg>
      </div>

      <style jsx>{`
        @keyframes dashSuccessCircle {
          from {
            stroke-dashoffset: 150;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes dashSuccessCheck {
          from {
            stroke-dashoffset: 45;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Animated Failure Circle & Cross (X)
   ───────────────────────────────────────────────────────────── */
function AnimatedFailureCross() {
  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto my-2">
      {/* Outer Glowing Ripple Rings */}
      <span
        className="absolute inline-flex h-full w-full rounded-full bg-red-500/25 opacity-75 animate-ping"
        style={{ animationDuration: "2.2s" }}
      />
      <span className="absolute -inset-2 rounded-full bg-red-500/15 animate-pulse" />
      <span className="absolute -inset-4 rounded-full bg-red-500/5 animate-pulse" style={{ animationDuration: "3s" }} />

      {/* Main Animated Circle with slight shake */}
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-red-500/30 via-red-500/15 to-red-500/5 border-2 border-red-500/60 flex items-center justify-center shadow-2xl shadow-red-500/30 backdrop-blur-sm animate-in zoom-in-50 duration-500">
        <svg
          className="w-14 h-14 text-red-500 stroke-current drop-shadow-md"
          viewBox="0 0 52 52"
          fill="none"
        >
          {/* Animated Circle Border */}
          <circle
            cx="26"
            cy="26"
            r="23"
            strokeWidth="3.2"
            strokeLinecap="round"
            style={{
              strokeDasharray: 150,
              strokeDashoffset: 150,
              animation: "dashFailureCircle 0.65s cubic-bezier(0.65, 0, 0.45, 1) forwards",
            }}
          />
          {/* Animated X Diagonal 1 */}
          <path
            d="M16 16 L36 36"
            strokeWidth="3.8"
            strokeLinecap="round"
            style={{
              strokeDasharray: 35,
              strokeDashoffset: 35,
              animation: "dashFailureCross 0.35s cubic-bezier(0.65, 0, 0.45, 1) 0.45s forwards",
            }}
          />
          {/* Animated X Diagonal 2 */}
          <path
            d="M36 16 L16 36"
            strokeWidth="3.8"
            strokeLinecap="round"
            style={{
              strokeDasharray: 35,
              strokeDashoffset: 35,
              animation: "dashFailureCross 0.35s cubic-bezier(0.65, 0, 0.45, 1) 0.65s forwards",
            }}
          />
        </svg>
      </div>

      <style jsx>{`
        @keyframes dashFailureCircle {
          from {
            stroke-dashoffset: 150;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes dashFailureCross {
          from {
            stroke-dashoffset: 35;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Animated Cancelled Warning Circle
   ───────────────────────────────────────────────────────────── */
function AnimatedCancelledWarning() {
  return (
    <div className="relative flex items-center justify-center w-28 h-28 mx-auto my-2">
      <span className="absolute -inset-2 rounded-full bg-amber-500/15 animate-pulse" />
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/30 via-amber-500/15 to-amber-500/5 border-2 border-amber-500/60 flex items-center justify-center shadow-2xl shadow-amber-500/20 backdrop-blur-sm animate-in zoom-in-50 duration-500">
        <AlertTriangle className="w-12 h-12 text-amber-400 animate-bounce" style={{ animationDuration: "2s" }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Payment Result Content Component
   ───────────────────────────────────────────────────────────── */
function PaymentResultContent() {
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isAr = locale === "ar";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renewModalOpen, setRenewModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function verifyPayment() {
      const paymentId = searchParams.get("paymentId") || searchParams.get("Id");
      const invoiceId = searchParams.get("invoiceId") || searchParams.get("InvoiceId");
      const paymentRef =
        searchParams.get("ref") ||
        searchParams.get("cartId") ||
        searchParams.get("cart_id") ||
        searchParams.get("paymentRef");
      const tranRef = searchParams.get("tranRef") || searchParams.get("tran_ref");
      const statusParam = searchParams.get("status");

      if ((statusParam === "paid" || statusParam === "success") && !paymentId && !invoiceId && !paymentRef) {
        if (isMounted) {
          const today = new Date();
          const expiry = new Date(today);
          expiry.setDate(expiry.getDate() + 30);
          setData({
            status: "paid",
            planName: isAr ? "باقة الاشتراك الشهري" : "Monthly Membership Plan",
            amount: 35.0,
            currency: isAr ? "د.أ" : "JOD",
            newExpiryDate: expiry.toISOString().slice(0, 10),
            transactionRef: "UG-DEMO-78412",
          });
          setLoading(false);
        }
        return;
      }

      if ((statusParam === "error" || statusParam === "failed" || statusParam === "fail") && !paymentId && !invoiceId && !paymentRef) {
        if (isMounted) {
          setData({
            status: "failed",
            error: isAr
              ? "تم رفض المعاملة من جهة البنك أو تم إلغاؤها."
              : "Transaction was rejected by the bank or failed.",
          });
          setLoading(false);
        }
        return;
      }

      if (statusParam === "cancelled" && !paymentId && !invoiceId && !paymentRef) {
        if (isMounted) {
          setData({
            status: "cancelled",
            error: isAr
              ? "تم إلغاء عملية الدفع بناءً على طلبك."
              : "Payment was cancelled.",
          });
          setLoading(false);
        }
        return;
      }

      if (!paymentId && !invoiceId && !paymentRef && !tranRef) {
        if (isMounted) {
          setError(
            isAr
              ? "معرف الدفع غير موجود في الرابط."
              : "Payment identifier is missing from the return URL."
          );
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: paymentId || undefined,
            invoiceId: invoiceId || undefined,
            paymentRef: paymentRef || undefined,
            tranRef: tranRef || undefined,
          }),
        });

        const resData = await res.json().catch(() => null);

        if (!isMounted) return;

        if (resData?.success && resData?.data) {
          setData(resData.data);
        } else if (resData?.data) {
          setData(resData.data);
        } else {
          setData({
            status: "failed",
            error: resData?.message || "Payment verification failed",
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setError(
          err instanceof Error
            ? err.message
            : isAr
              ? "حدث خطأ أثناء التحقق من الدفع."
              : "Error verifying payment."
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verifyPayment();

    return () => {
      isMounted = false;
    };
  }, [searchParams, isAr]);

  if (loading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center p-6 text-center space-y-5 animate-fade-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary animate-pulse">
            <Loader2 className="w-10 h-10 animate-spin" />
          </div>
          <span className="absolute -inset-2 rounded-3xl bg-primary/5 animate-ping opacity-40" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-foreground">
            {isAr ? "جاري التحقق من عملية الدفع..." : "Verifying Payment Status..."}
          </h2>
          <p className="text-xs text-foreground/70 max-w-sm mx-auto leading-relaxed">
            {isAr
              ? "يرجى الانتظار لحظات بينما نتأكد من نجاح الدفع وتفعيل اشتراكك في النظام."
              : "Please wait while we securely confirm your payment with the gateway."}
          </p>
        </div>
      </div>
    );
  }

  const isSuccess = data?.status === "paid";
  const isCancelled = data?.status === "cancelled";

  return (
    <div className="max-w-md mx-auto py-8 px-4 space-y-6 animate-fade-in">
      <Card className="overflow-hidden border-border/80 shadow-2xl rounded-3xl p-6 text-center bg-card">
        <CardContent className="p-0 space-y-6">
          {/* ── 1. ANIMATED STATUS CIRCLE ── */}
          <div className="flex justify-center pt-2">
            {isSuccess ? (
              <AnimatedSuccessCheckmark />
            ) : isCancelled ? (
              <AnimatedCancelledWarning />
            ) : (
              <AnimatedFailureCross />
            )}
          </div>

          {/* ── 2. STATUS HEADINGS & BADGES ── */}
          <div className="space-y-2">
            <div className="flex justify-center">
              {isSuccess ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-black text-xs px-3 py-1 gap-1.5 rounded-full shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
                  <span>{isAr ? "تم تجديد الاشتراك بنجاح" : "Subscription Renewed"}</span>
                </Badge>
              ) : isCancelled ? (
                <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-xs px-3 py-1 rounded-full">
                  {isAr ? "تم إلغاء العملية" : "Transaction Cancelled"}
                </Badge>
              ) : (
                <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 font-black text-xs px-3 py-1 rounded-full shadow-sm">
                  {isAr ? "فشلت عملية الدفع" : "Payment Failed"}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-black text-foreground tracking-tight">
              {isSuccess
                ? isAr
                  ? "مبروك! تم تفعيل اشتراكك"
                  : "Congratulations! Active Plan"
                : isCancelled
                  ? isAr
                    ? "تم إلغاء عملية الدفع"
                    : "Payment Cancelled"
                  : isAr
                    ? "تعذر إتمام عملية التجديد"
                    : "Payment Unsuccessful"}
            </h1>

            <p className="text-xs text-foreground/75 max-w-sm mx-auto leading-relaxed">
              {isSuccess
                ? isAr
                  ? "تم تجديد عضويتك بنجاح وتحديث كافة بياناتك. يمكنك الآن الاستمتاع بجميع خدمات ونشاطات Nasaq Gym."
                  : "Your subscription has been renewed successfully. You can now access all Nasaq Gym features."
                : isCancelled
                  ? isAr
                    ? "تم إلغاء الدفع بناءً على رغبتك ولم يتم تغيير حالة اشتراكك."
                    : "Payment was cancelled and your subscription remains unchanged."
                  : error ||
                    data?.error ||
                    (isAr
                      ? "لم يتم خصم أي مبالغ من حسابك ولم يتغير اشتراكك. يمكنك المحاولة مرة أخرى."
                      : "No funds were charged. Your subscription remains unchanged.")}
            </p>
          </div>

          {/* ── 3. TRANSACTION DETAILS (SUCCESS) ── */}
          {isSuccess && (
            <div className="rounded-2xl bg-muted/40 border border-border/70 p-4 text-xs space-y-3 text-start shadow-inner">
              <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
                <span className="text-foreground/70">{isAr ? "باقة الاشتراك:" : "Plan:"}</span>
                <span className="font-black text-foreground text-sm">
                  {data?.planName || (isAr ? "اشتراك Nasaq Gym" : "Nasaq Gym Plan")}
                </span>
              </div>

              {data?.amount != null && (
                <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
                  <span className="text-foreground/70">{isAr ? "المبلغ المدفوع:" : "Amount Paid:"}</span>
                  <span className="font-black text-primary text-base tabular-nums">
                    {data.amount.toFixed(3)} {data.currency || (isAr ? "د.أ" : "JOD")}
                  </span>
                </div>
              )}

              {data?.newExpiryDate && (
                <div className="flex items-center justify-between pb-2.5 border-b border-border/50 bg-emerald-500/10 -mx-4 px-4 py-2 border-y border-emerald-500/20">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {isAr ? "صالح لغاية:" : "Valid Until:"}
                  </span>
                  <span className="font-black text-emerald-400 text-sm">
                    {formatLongDate(data.newExpiryDate, locale)}
                  </span>
                </div>
              )}

              {(data?.transactionRef || data?.invoiceId) && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-foreground/60">{isAr ? "رقم المرجع:" : "Reference:"}</span>
                  <span className="font-mono text-3xs text-foreground/80 bg-background/60 px-2 py-0.5 rounded border border-border/50">
                    {String(data.transactionRef || data.invoiceId)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 4. SANDBOX NOTICE ── */}
          <div className="py-0.5">
            <Badge variant="outline" className="text-3xs font-semibold text-foreground/60 border-border/50 bg-card">
              <FlaskConical className="w-3 h-3 text-amber-500 me-1" />
              {isAr
                ? "عملية تجريبية — Sandbox Test Mode"
                : "Sandbox Test Mode — No Real Money Charged"}
            </Badge>
          </div>

          {/* ── 5. ACTION BUTTONS ── */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {!isSuccess ? (
              <>
                <Button
                  onClick={() => setRenewModalOpen(true)}
                  className="h-11 rounded-2xl text-xs font-black bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-md shadow-primary/20 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isAr ? "إعادة المحاولة" : "Try Again"}</span>
                </Button>

                <Link
                  href="/home"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-11 rounded-2xl text-xs font-bold border-border/80 hover:bg-card-hover gap-1.5"
                  )}
                >
                  <Home className="w-4 h-4" />
                  <span>{isAr ? "الرئيسية" : "Home"}</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/profile"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-11 rounded-2xl text-xs font-bold border-border/80 hover:bg-card-hover gap-1.5"
                  )}
                >
                  <User className="w-4 h-4" />
                  <span>{isAr ? "الملف الشخصي" : "My Profile"}</span>
                </Link>

                <Link
                  href="/home"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "h-11 rounded-2xl text-xs font-black bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-lg shadow-primary/25"
                  )}
                >
                  <Home className="w-4 h-4" />
                  <span>{isAr ? "الصفحة الرئيسية" : "Go to Home"}</span>
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Renew Subscription Modal for "Try Again" */}
      <RenewSubscriptionModal
        open={renewModalOpen}
        onOpenChange={setRenewModalOpen}
        currentPlanName={data?.planName}
      />
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[65vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}
