"use client";

import { useEffect, useState, useCallback } from "react";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";
import {
  ChefHat,
  Check,
  Clock,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CafeOrder {
  id: string;
  orderNumber: string;
  status: string;
  time: string;
  counter: number;
  customer: string[];
  notes: string;
  items: string[];
}

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; label: string; icon: React.ReactNode }
> = {
  جديد: {
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
    label: "New",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  "قيد التحضير": {
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/20",
    label: "Preparing",
    icon: <ChefHat className="w-4 h-4" />,
  },
  جاهز: {
    color: "text-green-400",
    bg: "bg-green-400/10 border-green-400/20",
    label: "Ready",
    icon: <Check className="w-4 h-4" />,
  },
  "تم الاستلام": {
    color: "text-gray-400",
    bg: "bg-gray-400/10 border-gray-400/20",
    label: "Picked up",
    icon: <Check className="w-4 h-4" />,
  },
  "ملغي من الزبون": {
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
    label: "Cancelled",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<CafeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/cafe/orders");
      const data = await res.json();
      if (data.success) setOrders(data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cafe/orders")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setOrders(data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only polls while this screen is actually visible — see attendance-live
  // for the same fix and why (battery/data drain while backgrounded
  // otherwise; harmless no-op for an always-on kitchen kiosk screen since
  // that's never actually hidden).
  useVisiblePolling(fetchOrders, 10000);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      await fetch(`/api/cafe/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchOrders();
    } catch {
      // silent
    } finally {
      setUpdating(null);
    }
  };

  const getNextStatus = (current: string): string | null => {
    switch (current) {
      case "جديد":
        return "قيد التحضير";
      case "قيد التحضير":
        return "جاهز";
      case "جاهز":
        return "تم الاستلام";
      default:
        return null;
    }
  };

  const getPrevStatus = (current: string): string | null => {
    switch (current) {
      case "قيد التحضير":
        return "جديد";
      case "جاهز":
        return "قيد التحضير";
      default:
        return null;
    }
  };

  const activeOrders = orders.filter((o) =>
    ["جديد", "قيد التحضير", "جاهز"].includes(o.status)
  );
  const completedOrders = orders.filter((o) =>
    ["تم الاستلام", "ملغي من الزبون"].includes(o.status)
  );

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "---";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Kitchen Display</h1>
            <p className="text-xs text-foreground/70">
              {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchOrders()}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground/70 hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Active Orders */}
      {activeOrders.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-12 h-12 text-foreground/70 mx-auto mb-3" />
          <p className="text-foreground/70 font-semibold">No active orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeOrders.map((order) => {
            const config = STATUS_CONFIG[order.status] || STATUS_CONFIG["جديد"];
            const next = getNextStatus(order.status);
            const prev = getPrevStatus(order.status);
            return (
              <div
                key={order.id}
                className={cn(
                  "bg-card border rounded-2xl p-5 transition-all",
                  config.bg
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-bold", config.color)}>
                      {order.orderNumber}
                    </span>
                    <span
                      className={cn(
                        "text-3xs px-2 py-0.5 rounded-full font-semibold",
                        config.bg,
                        config.color
                      )}
                    >
                      {order.status}
                    </span>
                  </div>
                  <span className="text-2xs text-foreground/70">
                    {formatTime(order.time)}
                  </span>
                </div>

                {order.notes && (
                  <div className="text-xs text-foreground/70 bg-background rounded-lg px-3 py-2 mb-3">
                    {order.notes}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4">
                  {prev && (
                    <button
                      onClick={() => updateStatus(order.id, prev)}
                      disabled={updating === order.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-foreground/70 hover:text-foreground transition-colors"
                    >
                      <ArrowRight className="w-3 h-3 rotate-180" />
                      Back
                    </button>
                  )}
                  {next && (
                    <button
                      onClick={() => updateStatus(order.id, next)}
                      disabled={updating === order.id}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                        updating === order.id
                          ? "opacity-50 cursor-not-allowed"
                          : "",
                        next === "جاهز"
                          ? "bg-accent text-accent-foreground hover:brightness-110"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                    >
                      {next === "جاهز" ? (
                        <>
                          <Check className="w-3 h-3" />
                          Mark Ready
                        </>
                      ) : next === "تم الاستلام" ? (
                        <>
                          <Check className="w-3 h-3" />
                          Picked Up
                        </>
                      ) : (
                        <>
                          <ChefHat className="w-3 h-3" />
                          Start Preparing
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Orders */}
      {completedOrders.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-foreground/70 mb-3">
            Completed / Cancelled
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {completedOrders.map((order) => {
              const config =
                STATUS_CONFIG[order.status] || STATUS_CONFIG["تم الاستلام"];
              return (
                <div
                  key={order.id}
                  className="bg-card border border-border rounded-xl p-4 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground/70 text-sm">
                      {order.orderNumber}
                    </span>
                    <span
                      className={cn(
                        "text-3xs px-2 py-0.5 rounded-full font-semibold",
                        config.bg,
                        config.color
                      )}
                    >
                      {order.status}
                    </span>
                  </div>
                  <span className="text-2xs text-foreground/70 mt-1 block">
                    {formatTime(order.time)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
