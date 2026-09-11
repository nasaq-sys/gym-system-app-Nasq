"use client";

import { useEffect, useState } from "react";

/**
 * Screen Wake Lock Utility
 * Keeps the screen awake during workout sessions so users don't have to unlock
 * their phones between sets. Automatically handles visibility changes (e.g. app switching).
 */

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

let sentinel: WakeLockSentinel | null = null;
let isWanted = false;
let isPending = false;
const listeners = new Set<(active: boolean) => void>();

function notifyListeners(active: boolean) {
  listeners.forEach((fn) => {
    try {
      fn(active);
    } catch {
      // ignore
    }
  });
}

async function acquire(): Promise<boolean> {
  if (!isWanted || sentinel || isPending || !isWakeLockSupported()) {
    return !!sentinel;
  }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }

  isPending = true;
  try {
    const s = await navigator.wakeLock.request("screen");
    if (!isWanted) {
      s.release().catch(() => {});
      return false;
    }
    sentinel = s;
    notifyListeners(true);

    s.addEventListener("release", () => {
      if (sentinel === s) {
        sentinel = null;
        notifyListeners(false);
      }
    });
    return true;
  } catch {
    // Some devices reject in low-power mode or battery saver
    sentinel = null;
    notifyListeners(false);
    return false;
  } finally {
    isPending = false;
  }
}

function onVisibilityChange() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    acquire();
  }
}

export function requestWakeLock(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  isWanted = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  return acquire();
}

export function releaseWakeLock(): void {
  if (typeof window === "undefined") return;
  isWanted = false;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  const s = sentinel;
  sentinel = null;
  if (s) {
    s.release().catch(() => {});
  }
  notifyListeners(false);
}

export function isWakeLockActive(): boolean {
  return !!sentinel;
}

/**
 * React hook to manage wake lock state
 */
export function useWakeLock(initialEnabled = false) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isWakeLockSupported());

    const updateState = (isActive: boolean) => setActive(isActive);
    listeners.add(updateState);

    return () => {
      listeners.delete(updateState);
    };
  }, []);

  useEffect(() => {
    if (!supported) return;

    if (enabled) {
      requestWakeLock().then((res) => setActive(res));
    } else {
      releaseWakeLock();
      setActive(false);
    }

    return () => {
      if (enabled) {
        releaseWakeLock();
      }
    };
  }, [enabled, supported]);

  const toggle = () => {
    setEnabled((prev) => !prev);
  };

  return {
    supported,
    enabled,
    active,
    setEnabled,
    toggle,
  };
}
