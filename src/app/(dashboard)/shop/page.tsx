"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Card } from "@/components/ui/card";
import { Plus, Minus, ShoppingCart, Coffee, Store, Package, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/CartProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MAX_ORDER_ITEM_QTY } from "@/lib/constants";
import { clientFetch, getClientCachedData } from "@/lib/clientCache";


interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  available: boolean;
  stockQty: number;
  image?: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stockStatus: string;
  stockQty: number;
  minAlert: number;
  image?: string | null;
}

const CAFE_CATEGORY_ORDER = ["وجبات", "مشروبات", "سناكس"];

const CATEGORY_ICON_COLORS: Record<string, string> = {
  "وجبات": "text-orange-400",
  "مشروبات": "text-sky-400",
  "سناكس": "text-amber-400",
  "مكملات": "text-purple-400",
  "تجهيزات": "text-green-400",
  "ملابس": "text-rose-400",
};

function categoryColor(category: string): string {
  return CATEGORY_ICON_COLORS[category] || "text-primary";
}

function fmtMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function ProductImage({
  src,
  alt,
  icon: Icon,
  category,
}: {
  src?: string | null;
  alt: string;
  icon: LucideIcon;
  category: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/40">
      <Icon className={cn("w-11 h-11", categoryColor(category))} strokeWidth={1.8} />
    </div>
  );
}

export default function ShopPage() {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [activeTab, setActiveTab] = useState<string>("kitchen");

  const {
    kitchen,
    store,
    kitchenCount,
    storeCount,
    kitchenTotal,
    storeTotal,
    addKitchen,
    decrementKitchen,
    addStore,
    decrementStore,
    openCart,
  } = useCart();

  const [menu, setMenu] = useState<MenuItem[]>(() => getClientCachedData<MenuItem[]>("/api/cafe/menu") || []);
  const [menuLoading, setMenuLoading] = useState(() => !getClientCachedData("/api/cafe/menu"));
  const [kitchenFilter, setKitchenFilter] = useState("all");

  const [products, setProducts] = useState<Product[]>(() => getClientCachedData<Product[]>("/api/store/products") || []);
  const [storeLoading, setStoreLoading] = useState(() => !getClientCachedData("/api/store/products"));
  const [storeFilter, setStoreFilter] = useState("all");

  useEffect(() => {
    clientFetch<any>("/api/cafe/menu", undefined, { ttlMs: 60000 })
      .then((res) => {
        const data = res?.data ?? res;
        if (Array.isArray(data)) setMenu(data);
      })
      .catch(() => {})
      .finally(() => setMenuLoading(false));
  }, []);

  useEffect(() => {
    clientFetch<any>("/api/store/products", undefined, { ttlMs: 60000 })
      .then((res) => {
        const data = res?.data ?? res;
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {})
      .finally(() => setStoreLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "store") setActiveTab("store");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const kitchenCategories = [...new Set(menu.map((m) => m.category))].sort(
    (a, b) => CAFE_CATEGORY_ORDER.indexOf(a) - CAFE_CATEGORY_ORDER.indexOf(b)
  );
  const filteredMenu =
    kitchenFilter === "all" ? menu : menu.filter((m) => m.category === kitchenFilter);

  const storeCategories = [...new Set(products.map((p) => p.category))];
  const filteredProducts =
    storeFilter === "all" ? products : products.filter((p) => p.category === storeFilter);
  const inStock = (p: Product) =>
    (p.stockStatus?.includes("متوفر") ?? false) &&
    p.stockQty > 0 &&
    !p.stockStatus?.includes("نفد");

  const isKitchenLoading = activeTab === "kitchen" && menuLoading;
  const isStoreLoading = activeTab === "store" && storeLoading;
  const totalCount = kitchenCount + storeCount;
  const total = kitchenTotal + storeTotal;

  return (
    <div className="space-y-6 pb-12">
      {/* Desktop Hero Banner */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl bg-card border border-border/80 p-6 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1.5">
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary text-primary-foreground font-bold">
              <Store className="w-3.5 h-3.5" />
              <span>{isAr ? "متجر وكافيه النادي الرسمي" : "Official Gym Store & Cafe"}</span>
            </Badge>
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {t("shop.title")}
            </h1>
            <p className="text-sm text-foreground/70">
              {isAr
                ? "مشروبات البروتين، المكملات الغذائية، والوجبات الصحية الطازجة جاهزة لاستلامك فوراً."
                : "Order protein shakes, healthy meals, and fitness supplements."}
            </p>
          </div>
          {(kitchenCount > 0 || storeCount > 0) && (
            <Button
              onClick={openCart}
              className="gap-2 shrink-0 font-bold"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{isAr ? "عرض السلة" : "View Cart"} ({kitchenCount + storeCount})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex lg:hidden items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("shop.title")}</h1>
          <p className="text-sm text-foreground/70 mt-1">
            {isAr ? "اطلب من الكافيه والمتجر مباشرة" : "Order from the cafe and store"}
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="kitchen" className="gap-2 font-bold text-sm">
            <Coffee className="w-4 h-4" />
            <span>{t("shop.kitchen")}</span>
            {kitchenCount > 0 && (
              <Badge variant="secondary" className="text-3xs h-4 px-1 font-bold">
                {kitchenCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="store" className="gap-2 font-bold text-sm">
            <Store className="w-4 h-4" />
            <span>{t("shop.store")}</span>
            {storeCount > 0 && (
              <Badge variant="secondary" className="text-3xs h-4 px-1 font-bold">
                {storeCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Kitchen Tab Content ── */}
        <TabsContent value="kitchen" className="mt-6 space-y-4">
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Badge
              variant={kitchenFilter === "all" ? "default" : "outline"}
              onClick={() => setKitchenFilter("all")}
              className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl"
            >
              {isAr ? "الكل" : "All"}
            </Badge>
            {kitchenCategories.map((cat) => (
              <Badge
                key={cat}
                variant={kitchenFilter === cat ? "default" : "outline"}
                onClick={() => setKitchenFilter(cat)}
                className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl"
              >
                {cat}
              </Badge>
            ))}
          </div>

          {/* Menu Grid */}
          {isKitchenLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {filteredMenu.map((item) => {
                const inCart = kitchen.find((c) => c.menuItemId === item.id);
                const maxQty = Math.min(
                  MAX_ORDER_ITEM_QTY,
                  typeof item.stockQty === "number" ? item.stockQty : MAX_ORDER_ITEM_QTY
                );
                const isAvailable = item.available && (typeof item.stockQty === "number" ? item.stockQty > 0 : true);
                const atMax = inCart ? inCart.quantity >= maxQty : false;
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "overflow-hidden p-0 transition-all hover:border-primary/40",
                      inCart && "ring-2 ring-primary/40"
                    )}
                  >
                    <div className="flex flex-col h-full">
                      <div className="p-2 pb-0">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted/40">
                          <ProductImage src={item.image} alt={item.name} icon={Coffee} category={item.category} />
                          {!isAvailable && (
                            <Badge variant="destructive" className="absolute top-1.5 start-1.5 text-3xs">
                              {isAr ? "غير متوفر" : "Unavailable"}
                            </Badge>
                          )}
                          {isAvailable && maxQty <= 5 && (
                            <Badge variant="secondary" className="absolute top-1.5 end-1.5 text-3xs bg-amber-500/20 text-amber-500 border-amber-500/30">
                              {isAr ? `متبقي ${maxQty}` : `${maxQty} left`}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-3 flex flex-col flex-1">
                        <h3 className="font-bold text-foreground text-sm leading-snug truncate">
                          {item.name}
                        </h3>
                        <span className="text-2xs text-foreground/70 mt-0.5">
                          {item.category}
                        </span>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {isAvailable && (
                            inCart ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    decrementKitchen(item.id);
                                  }}
                                  className="w-7 h-7 rounded-full"
                                  aria-label={isAr ? "إنقاص" : "Decrease"}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-sm font-bold text-foreground w-5 text-center">
                                  {inCart.quantity}
                                </span>
                                <Button
                                  size="icon"
                                  disabled={atMax}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAvailable && !atMax) {
                                      addKitchen({
                                        menuItemId: item.id,
                                        name: item.name,
                                        price: item.price,
                                        maxQty,
                                        image: item.image,
                                      });
                                    }
                                  }}
                                  className={cn("w-7 h-7 rounded-full", atMax && "opacity-50 cursor-not-allowed")}
                                  aria-label={isAr ? "زيادة" : "Increase"}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                disabled={!isAvailable}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAvailable) {
                                    addKitchen({
                                      menuItemId: item.id,
                                      name: item.name,
                                      price: item.price,
                                      maxQty,
                                      image: item.image,
                                    });
                                  }
                                }}
                                className="w-8 h-8 rounded-full"
                                aria-label={isAr ? "إضافة" : "Add"}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            )
                          )}
                          <span className="text-base font-bold text-primary ms-auto">
                            {fmtMoney(item.price)} {isAr ? "د.أ" : "JOD"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Store Tab Content ── */}
        <TabsContent value="store" className="mt-6 space-y-4">
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Badge
              variant={storeFilter === "all" ? "default" : "outline"}
              onClick={() => setStoreFilter("all")}
              className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl"
            >
              {isAr ? "الكل" : "All"}
            </Badge>
            {storeCategories.map((cat) => (
              <Badge
                key={cat}
                variant={storeFilter === cat ? "default" : "outline"}
                onClick={() => setStoreFilter(cat)}
                className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl"
              >
                {cat}
              </Badge>
            ))}
          </div>

          {/* Products Grid */}
          {isStoreLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {filteredProducts.map((product) => {
                const available = inStock(product);
                const inCart = store.find((c) => c.productId === product.id);
                const maxQty = Math.min(MAX_ORDER_ITEM_QTY, product.stockQty);
                const atMax = inCart && inCart.quantity >= maxQty;
                return (
                  <Card
                    key={product.id}
                    className={cn(
                      "overflow-hidden p-0 transition-all hover:border-primary/40",
                      inCart && "ring-2 ring-primary/40"
                    )}
                  >
                    <div className="flex flex-col h-full">
                      <div className="p-2 pb-0">
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted/40">
                          <ProductImage src={product.image} alt={product.name} icon={Package} category={product.category} />
                          {!available && (
                            <Badge variant="destructive" className="absolute top-1.5 start-1.5 text-3xs">
                              {isAr ? "نفد المخزون" : "Out of stock"}
                            </Badge>
                          )}
                          {available && product.stockQty <= product.minAlert && (
                            <Badge variant="secondary" className="absolute top-1.5 end-1.5 text-3xs bg-warning/20 text-warning border-warning/30">
                              {isAr ? `متبقي ${product.stockQty}` : `${product.stockQty} left`}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-3 flex flex-col flex-1">
                        <h3 className="font-bold text-foreground text-sm leading-snug truncate">
                          {product.name}
                        </h3>
                        <span className="text-2xs text-foreground/70 mt-0.5">
                          {product.category}
                        </span>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {available && (
                            inCart ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    decrementStore(product.id);
                                  }}
                                  className="w-7 h-7 rounded-full"
                                  aria-label={isAr ? "إنقاص" : "Decrease"}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </Button>
                                <span className="text-sm font-bold text-foreground w-5 text-center">
                                  {inCart.quantity}
                                </span>
                                <Button
                                  size="icon"
                                  disabled={atMax}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (available && !atMax) {
                                      addStore({
                                        productId: product.id,
                                        name: product.name,
                                        price: product.price,
                                        maxQty,
                                        image: product.image,
                                      });
                                    }
                                  }}
                                  className={cn("w-7 h-7 rounded-full", atMax && "opacity-50 cursor-not-allowed")}
                                  aria-label={isAr ? "زيادة" : "Increase"}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (available) {
                                    addStore({
                                      productId: product.id,
                                      name: product.name,
                                      price: product.price,
                                      maxQty,
                                      image: product.image,
                                    });
                                  }
                                }}
                                className="w-8 h-8 rounded-full"
                                aria-label={isAr ? "إضافة" : "Add"}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            )
                          )}
                          <span className="text-base font-bold text-primary ms-auto">
                            {fmtMoney(product.price)} {isAr ? "د.أ" : "JOD"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Floating cart button */}
      {totalCount > 0 && (
        <Button
          onClick={openCart}
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-full px-5 py-6 shadow-2xl gap-3 h-auto"
        >
          <span className="relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -end-2 min-w-[16px] h-4 px-0.5 rounded-full bg-primary-foreground text-primary text-[9px] font-bold flex items-center justify-center">
              {totalCount}
            </span>
          </span>
          <span className="text-sm font-bold">
            {fmtMoney(total)} {isAr ? "د.أ" : "JOD"}
          </span>
          <span className="text-xs font-semibold opacity-90">
            {isAr ? "عرض السلة" : "View cart"}
          </span>
        </Button>
      )}
    </div>
  );
}
