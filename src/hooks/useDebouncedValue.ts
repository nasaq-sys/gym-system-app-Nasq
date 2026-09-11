"use client";

import { useEffect, useState } from "react";

/**
 * Custom hook to debounce any value by a given delay.
 * Separates immediate input state from debounced search state.
 *
 * @param value The value to debounce (e.g., raw search input string)
 * @param delayMs Delay in milliseconds (defaults to 300ms)
 * @returns The debounced value updated after delayMs of inactivity
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
