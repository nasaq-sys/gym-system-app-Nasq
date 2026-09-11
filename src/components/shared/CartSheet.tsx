"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/useI18n";
import { useCart } from "@/lib/CartProvider";
import { cn } from "@/lib/utils";
import {
  ShoppingBag,
  Store,
  Coffee,
  X,
  Plus,
  Minus,
  Trash2,
  Check,
  ClipboardList,
  ImageIcon,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MAX_ORDER_ITEM_QTY } from "@/lib/constants";

function fmtMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default function CartSheet() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const isAr = locale === "ar";

  const {
    kitchen,
    store,
    totalCount,
    kitchenTotal,
    storeTotal,
    cartOpen,
    closeCart,
    addKitchen,
    decrementKitchen,
    removeKitchen,
    clearKitchen,
    addStore,
    decrementStore,
    removeStore,
    clearStore,
  } = useCart();

  const [kitchenSubmitting, setKitchenSubmitting] = useState(false);
  const [storeSubmitting, setStoreSubmitting] = useState(false);
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [kitchenSuccess, setKitchenSuccess] = useState<string | null>(null);
  const [storeSuccess, setStoreSuccess] = useState<string | null>(null);

  const goMyOrders = () => {
    closeCart();
    router.push("/my-orders");
  };

  const placeKitchenOrder = async () => {
    if (!kitchen.length || kitchenSubmitting) return;
    setKitchenSubmitting(true);
    setKitchenError(null);
    try {
      const res = await fetch("/api/cafe/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: kitchen.map(({ menuItemId, name, price, quantity }) => ({
            menuItemId,
            name,
            price,
            quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKitchenSuccess(data.data.orderNumber);
        clearKitchen();
      } else {
        setKitchenError(data.message || (isAr ? "فشل إرسال الطلب" : "Failed to place order"));
      }
    } catch {
      setKitchenError(isAr ? "خطأ في الاتصال، حاول مرة أخرى" : "Connection error, try again");
    } finally {
      setKitchenSubmitting(false);
    }
  };

  const placeStoreOrder = async () => {
    if (!store.length || storeSubmitting) return;
    setStoreSubmitting(true);
    setStoreError(null);
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: store.map(({ productId, name, price, quantity }) => ({
            productId,
            name,
            price,
            quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStoreSuccess(data.data.orderNumber);
        clearStore();
      } else {
        setStoreError(data.message || (isAr ? "فشل إرسال الطلب" : "Failed to place order"));
      }
    } catch {
      setStoreError(isAr ? "خطأ في الاتصال، حاول مرة أخرى" : "Connection error, try again");
    } finally {
      setStoreSubmitting(false);
    }
  };

  const total = kitchenTotal + storeTotal;
  const empty = totalCount === 0;

  return (
    <Drawer
      open={cartOpen}
      onOpenChange={(open) => !open && closeCart()}
    >
      <DrawerContent className="max-h-[85vh] flex flex-col p-0 bg-card text-foreground">
        {/* Header */}
        <DrawerHeader className="flex flex-row items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <DrawerTitle className="text-base font-bold text-foreground">
              {t("cart.title")}
            </DrawerTitle>
            {!empty && (
              <Badge variant="secondary" className="font-bold">
                {totalCount}
              </Badge>
            )}
          </div>
          <DrawerClose
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "w-8 h-8 rounded-full text-foreground/70 hover:text-foreground cursor-pointer")}
            aria-label={isAr ? "إغلاق" : "Close"}
          >
            <X className="w-4 h-4" />
          </DrawerClose>
        </DrawerHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {empty ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="w-8 h-8 text-foreground/70" />
              </div>
              <p className="font-bold text-foreground">{t("cart.empty")}</p>
              <p className="text-sm text-foreground/70 mt-1">{t("cart.emptyHint")}</p>
            </div>
          ) : (
            <>
              {/* Kitchen section */}
              {kitchen.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
                      <Coffee className="w-4 h-4 text-primary" />
                    </span>
                    <h3 className="text-sm font-bold text-foreground">{t("shop.kitchen")}</h3>
                    <span className="text-xs text-foreground/70 ms-auto">
                      {t("cart.items", { n: String(kitchen.length) })}
                    </span>
                  </div>

                  {kitchenSuccess && (
                    <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <p className="text-xs text-success font-semibold">
                        {isAr ? "تم إرسال الطلب بنجاح! رقم الطلب" : "Order placed! Order #"}{" "}
                        {kitchenSuccess}
                      </p>
                    </div>
                  )}

                  <div className="bg-card rounded-xl border border-border divide-y divide-border/60">
                    {kitchen.map((item) => (
                      <div key={item.menuItemId} className="flex items-center gap-3 p-3">
                        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-muted/40 border border-border flex items-center justify-center">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-foreground/70" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-foreground/70">
                            {fmtMoney(item.price)} {isAr ? "د.أ" : "JOD"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="w-7 h-7 rounded-full"
                            onClick={() => decrementKitchen(item.menuItemId)}
                            aria-label={isAr ? "إنقاص" : "Decrease"}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-sm font-bold text-foreground w-6 text-center">
                            {item.quantity}
                          </span>
                          {(() => {
                            const max = Math.min(MAX_ORDER_ITEM_QTY, item.maxQty ?? MAX_ORDER_ITEM_QTY);
                            const atMax = item.quantity >= max;
                            return (
                              <Button
                                variant="outline"
                                size="icon"
                                className={cn(
                                  "w-7 h-7 rounded-full",
                                  atMax && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={() =>
                                  addKitchen({
                                    menuItemId: item.menuItemId,
                                    name: item.name,
                                    price: item.price,
                                    maxQty: max,
                                    image: item.image,
                                  })
                                }
                                disabled={atMax}
                                aria-label={isAr ? "زيادة" : "Increase"}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            );
                          })()}
                        </div>
                        <span className="text-sm font-bold text-foreground w-14 text-end">
                          {fmtMoney(item.price * item.quantity)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeKitchen(item.menuItemId)}
                          className="text-foreground/70 hover:text-destructive"
                          aria-label={isAr ? "إزالة" : "Remove"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {kitchenError && (
                    <p className="text-xs text-destructive font-semibold">{kitchenError}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground/70">
                      {t("cart.subtotal")}:{" "}
                      <span className="font-bold text-foreground">
                        {fmtMoney(kitchenTotal)} {isAr ? "د.أ" : "JOD"}
                      </span>
                    </span>
                    <Button
                      onClick={placeKitchenOrder}
                      disabled={kitchenSubmitting}
                    >
                      {kitchenSubmitting
                        ? isAr ? "جاري الإرسال..." : "Placing..."
                        : isAr ? "إرسال طلب المطبخ" : "Place Kitchen Order"}
                    </Button>
                  </div>
                </section>
              )}

              {/* Store section */}
              {store.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
                      <Store className="w-4 h-4 text-primary" />
                    </span>
                    <h3 className="text-sm font-bold text-foreground">{t("shop.store")}</h3>
                    <span className="text-xs text-foreground/70 ms-auto">
                      {t("cart.items", { n: String(store.length) })}
                    </span>
                  </div>

                  {storeSuccess && (
                    <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <p className="text-xs text-success font-semibold">
                        {isAr ? "تم إرسال الطلب بنجاح! رقم الطلب" : "Order placed! Order #"}{" "}
                        {storeSuccess}
                      </p>
                    </div>
                  )}

                  <div className="bg-card rounded-xl border border-border divide-y divide-border/60">
                    {store.map((item) => (
                      <div key={item.productId} className="flex items-center gap-3 p-3">
                        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-muted/40 border border-border flex items-center justify-center">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-foreground/70" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-foreground/70">
                            {fmtMoney(item.price)} {isAr ? "د.أ" : "JOD"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="w-7 h-7 rounded-full"
                            onClick={() => decrementStore(item.productId)}
                            aria-label={isAr ? "إنقاص" : "Decrease"}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-sm font-bold text-foreground w-6 text-center">
                            {item.quantity}
                          </span>
                          {(() => {
                            const max = Math.min(MAX_ORDER_ITEM_QTY, item.maxQty ?? MAX_ORDER_ITEM_QTY);
                            const atMax = item.quantity >= max;
                            return (
                              <Button
                                variant="outline"
                                size="icon"
                                className={cn(
                                  "w-7 h-7 rounded-full",
                                  atMax && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={() =>
                                  addStore({
                                    productId: item.productId,
                                    name: item.name,
                                    price: item.price,
                                    maxQty: max,
                                    image: item.image,
                                  })
                                }
                                disabled={atMax}
                                aria-label={isAr ? "زيادة" : "Increase"}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            );
                          })()}
                        </div>
                        <span className="text-sm font-bold text-foreground w-14 text-end">
                          {fmtMoney(item.price * item.quantity)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStore(item.productId)}
                          className="text-foreground/70 hover:text-destructive"
                          aria-label={isAr ? "إزالة" : "Remove"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {storeError && (
                    <p className="text-xs text-destructive font-semibold">{storeError}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground/70">
                      {t("cart.subtotal")}:{" "}
                      <span className="font-bold text-foreground">
                        {fmtMoney(storeTotal)} {isAr ? "د.أ" : "JOD"}
                      </span>
                    </span>
                    <Button
                      onClick={placeStoreOrder}
                      disabled={storeSubmitting}
                    >
                      {storeSubmitting
                        ? isAr ? "جاري الإرسال..." : "Placing..."
                        : isAr ? "إرسال طلب المتجر" : "Place Store Order"}
                    </Button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!empty && (
          <DrawerFooter className="p-5 border-t border-border shrink-0 space-y-2 bg-card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{t("cart.total")}</span>
              <span className="text-lg font-bold text-primary">
                {fmtMoney(total)} {isAr ? "د.أ" : "JOD"}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={goMyOrders}
              className="w-full"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{t("nav.myOrders")}</span>
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
