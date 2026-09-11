"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Coffee,
  Store,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface OrderItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface MyOrder {
  id: string;
  type: "cafe" | "store";
  orderNumber: string;
  status: string;
  time: string;
  counter: number;
  notes: string;
  items: OrderItem[];
}

const STATUS_STYLE: Record<string, { text: string; bg: string }> = {
  "جديد": { text: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/25" },
  "قيد التحضير": { text: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/25" },
  "جاهز": { text: "text-green-400", bg: "bg-green-400/10 border-green-400/25" },
  "تم الاستلام": { text: "text-foreground/70", bg: "bg-muted/30 border-border" },
  "ملغي من الزبون": { text: "text-destructive", bg: "bg-destructive/10 border-destructive/25" },
  "ملغي": { text: "text-destructive", bg: "bg-destructive/10 border-destructive/25" },
};

function fmtMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function statusLabel(t: (k: string) => string, status: string): string {
  switch (status) {
    case "جديد":
      return t("orders.statusNew");
    case "قيد التحضير":
      return t("orders.statusPreparing");
    case "جاهز":
      return t("orders.statusReady");
    case "تم الاستلام":
      return t("orders.statusPickedUp");
    case "ملغي من الزبون":
    case "ملغي":
      return t("orders.statusCancelled");
    default:
      return status;
  }
}

export default function MyOrdersPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/my");
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
        setError(null);
      } else {
        setError(data.message);
      }
    } catch {
      setError(isAr ? "خطأ في تحميل الطلبات" : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 0);
    let pollId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const jitterMs = (Math.random() - 0.5) * 6000;
      pollId = setTimeout(() => {
        fetchOrders();
        scheduleNext();
      }, 20000 + jitterMs);
    };
    scheduleNext();
    return () => {
      clearTimeout(timer);
      clearTimeout(pollId);
    };
  }, [fetchOrders]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "---";
      return new Intl.DateTimeFormat(isAr ? "ar" : "en-US", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return "---";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Desktop Hero Banner */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary text-primary-foreground font-bold">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{isAr ? "سجل الطلبات والمشتريات" : "Order History"}</span>
            </Badge>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("orders.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "متابعة حالة طلباتك من بار الكافيه والمتجر الرياضي خطوة بخطوة."
                : "Track your cafe and store orders live status."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchOrders}
            className="gap-2 shrink-0 font-bold"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t("orders.refresh")}</span>
          </Button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex lg:hidden items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("orders.title")}</h1>
          <p className="text-sm text-foreground/70 mt-1">{t("orders.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchOrders}
          aria-label={t("orders.refresh")}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {error && !orders.length && (
        <p className="text-sm text-destructive font-semibold">{error}</p>
      )}

      {orders.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <div className="w-16 h-16 bg-muted/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-foreground/70" />
            </div>
            <p className="font-bold text-foreground">{t("orders.noOrders")}</p>
            <p className="text-sm text-foreground/70 mt-1 mb-5">{t("orders.noOrdersHint")}</p>
            <Link
              href="/shop"
              className={cn(buttonVariants(), "gap-2 inline-flex")}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{t("orders.browse")}</span>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((order) => {
            const isCafe = order.type === "cafe";
            const style = STATUS_STYLE[order.status] || STATUS_STYLE["تم الاستلام"];
            const total = order.items.reduce((s, i) => s + i.total, 0);
            return (
              <Card key={order.id} className="p-0 overflow-hidden">
                <div className="p-4 border-b border-border flex items-center gap-3">
                  <span
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      isCafe ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-400"
                    )}
                  >
                    {isCafe ? <Coffee className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">
                        {order.orderNumber}
                      </span>
                      <Badge variant="secondary" className="text-3xs px-2 py-0.5">
                        {isCafe ? t("orders.kitchen") : t("orders.store")}
                      </Badge>
                    </div>
                    <p className="text-2xs text-foreground/70 mt-0.5">
                      {formatTime(order.time)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ms-auto gap-1.5 text-2xs font-bold whitespace-nowrap",
                      style.bg,
                      style.text
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        style.text.includes("blue") && "bg-blue-400",
                        style.text.includes("yellow") && "bg-yellow-400",
                        style.text.includes("green") && "bg-green-400",
                        style.text.includes("red") && "bg-destructive",
                        style.text.includes("muted") && "bg-muted-foreground"
                      )}
                    />
                    <span>{statusLabel(t, order.status)}</span>
                  </Badge>
                </div>

                <div className="p-4 space-y-3">
                  {/* Items */}
                  <div className="bg-muted/30 rounded-xl border border-border divide-y divide-border/60">
                    {order.items.length === 0 ? (
                      <p className="text-sm text-foreground/70 px-4 py-3">
                        {isAr ? "لا توجد بنود" : "No items"}
                      </p>
                    ) : (
                      order.items.map((item, i) => (
                        <div
                          key={`${item.name}-${i}`}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                        >
                          <span className="text-foreground font-semibold min-w-0 truncate">
                            {item.name}
                            <span className="text-foreground/70 font-normal"> × {item.qty}</span>
                          </span>
                          <span className="text-foreground/70 font-semibold whitespace-nowrap">
                            {fmtMoney(item.total)} {isAr ? "د.أ" : "JOD"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {order.notes && (
                    <p className="text-xs text-foreground/70">
                      {t("orders.notes")}: <span className="text-foreground">{order.notes}</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-foreground/70">{t("orders.total")}</span>
                    <span className="text-lg font-bold text-primary">
                      {fmtMoney(total)} {isAr ? "د.أ" : "JOD"}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
