"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MAX_ORDER_ITEM_QTY } from "@/lib/constants";

export interface KitchenCartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  maxQty?: number;
  image?: string | null;
}

export interface StoreCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  maxQty: number;
  image?: string | null;
}

const KITCHEN_KEY = "gojim_cart_kitchen";
const STORE_KEY = "gojim_cart_store";

interface CartContextValue {
  hydrated: boolean;
  kitchen: KitchenCartItem[];
  store: StoreCartItem[];
  kitchenCount: number;
  storeCount: number;
  totalCount: number;
  kitchenTotal: number;
  storeTotal: number;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addKitchen: (item: {
    menuItemId: string;
    name: string;
    price: number;
    maxQty?: number;
    image?: string | null;
  }) => void;
  decrementKitchen: (menuItemId: string) => void;
  removeKitchen: (menuItemId: string) => void;
  setKitchenQty: (menuItemId: string, qty: number) => void;
  clearKitchen: () => void;
  addStore: (item: {
    productId: string;
    name: string;
    price: number;
    maxQty: number;
    image?: string | null;
  }) => void;
  decrementStore: (productId: string) => void;
  removeStore: (productId: string) => void;
  setStoreQty: (productId: string, qty: number) => void;
  clearStore: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [kitchen, setKitchen] = useState<KitchenCartItem[]>([]);
  const [store, setStore] = useState<StoreCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration of client-only localStorage state on mount (external system) */
  useEffect(() => {
    setKitchen(read<KitchenCartItem[]>(KITCHEN_KEY, []));
    setStore(read<StoreCartItem[]>(STORE_KEY, []));
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KITCHEN_KEY, JSON.stringify(kitchen));
    } catch {
      // storage unavailable
    }
  }, [kitchen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      // storage unavailable
    }
  }, [store, hydrated]);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const addKitchen = useCallback<CartContextValue["addKitchen"]>((item) => {
    setKitchen((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.menuItemId);
      const rawMax = item.maxQty ?? existing?.maxQty ?? MAX_ORDER_ITEM_QTY;
      const max = Math.min(MAX_ORDER_ITEM_QTY, rawMax);
      if (existing) {
        if (existing.quantity >= max) return prev;
        return prev.map((c) =>
          c.menuItemId === item.menuItemId
            ? {
                ...c,
                quantity: Math.min(c.quantity + 1, max),
                maxQty: max,
                image: c.image ?? item.image,
              }
            : c
        );
      }
      if (max <= 0) return prev;
      return [
        ...prev,
        {
          menuItemId: item.menuItemId,
          name: item.name,
          price: item.price,
          quantity: 1,
          maxQty: max,
          image: item.image,
        },
      ];
    });
  }, []);

  const decrementKitchen = useCallback((menuItemId: string) => {
    setKitchen((prev) =>
      prev
        .map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity - 1) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeKitchen = useCallback((menuItemId: string) => {
    setKitchen((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  }, []);

  const setKitchenQty = useCallback((menuItemId: string, qty: number) => {
    setKitchen((prev) =>
      prev
        .map((item) => {
          if (item.menuItemId !== menuItemId) return item;
          const rawMax = item.maxQty ?? MAX_ORDER_ITEM_QTY;
          const max = Math.min(MAX_ORDER_ITEM_QTY, rawMax);
          return {
            ...item,
            quantity: Math.min(Math.max(0, qty), max),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const clearKitchen = useCallback(() => setKitchen([]), []);

  const addStore = useCallback<CartContextValue["addStore"]>((item) => {
    setStore((prev) => {
      const existing = prev.find((c) => c.productId === item.productId);
      const rawMax = item.maxQty ?? existing?.maxQty ?? MAX_ORDER_ITEM_QTY;
      const max = Math.min(MAX_ORDER_ITEM_QTY, rawMax);
      if (existing) {
        if (existing.quantity >= max) return prev;
        return prev.map((c) =>
          c.productId === item.productId
            ? { ...c, quantity: Math.min(c.quantity + 1, max), maxQty: max, image: c.image ?? item.image }
            : c
        );
      }
      if (max <= 0) return prev;
      return [
        ...prev,
        {
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: 1,
          maxQty: max,
          image: item.image,
        },
      ];
    });
  }, []);

  const decrementStore = useCallback((productId: string) => {
    setStore((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, item.quantity - 1) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeStore = useCallback((productId: string) => {
    setStore((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const setStoreQty = useCallback((productId: string, qty: number) => {
    setStore((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const rawMax = item.maxQty ?? MAX_ORDER_ITEM_QTY;
          const max = Math.min(MAX_ORDER_ITEM_QTY, rawMax);
          return {
            ...item,
            quantity: Math.min(Math.max(0, qty), max),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const clearStore = useCallback(() => setStore([]), []);

  const value = useMemo<CartContextValue>(() => {
    const kitchenCount = kitchen.reduce((s, c) => s + c.quantity, 0);
    const storeCount = store.reduce((s, c) => s + c.quantity, 0);
    const kitchenTotal = kitchen.reduce((s, c) => s + c.price * c.quantity, 0);
    const storeTotal = store.reduce((s, c) => s + c.price * c.quantity, 0);
    return {
      hydrated,
      kitchen,
      store,
      kitchenCount,
      storeCount,
      totalCount: kitchenCount + storeCount,
      kitchenTotal,
      storeTotal,
      cartOpen,
      openCart,
      closeCart,
      addKitchen,
      decrementKitchen,
      removeKitchen,
      setKitchenQty,
      clearKitchen,
      addStore,
      decrementStore,
      removeStore,
      setStoreQty,
      clearStore,
    };
  }, [
    hydrated,
    kitchen,
    store,
    cartOpen,
    openCart,
    closeCart,
    addKitchen,
    decrementKitchen,
    removeKitchen,
    setKitchenQty,
    clearKitchen,
    addStore,
    decrementStore,
    removeStore,
    setStoreQty,
    clearStore,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
