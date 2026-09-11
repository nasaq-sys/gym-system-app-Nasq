"use client";

import { useEffect, useRef } from "react";

// Runs `callback` on a fixed interval, but only while the tab/page is
// actually visible. A backgrounded tab — phone locked, app switched away,
// browser minimized — has no reason to keep waking the JS engine and firing
// a network request every N seconds; that's pure battery/data drain for
// zero visible benefit (reported: "وقت السكون ليه بعمل كول اب اي؟" — why is
// it making an API call while idle?). Automatically re-fires once
// immediately when the page becomes visible again, since whatever it missed
// while paused is now stale.
export function useVisiblePolling(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        callbackRef.current();
      }, intervalMs);
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
