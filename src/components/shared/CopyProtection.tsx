"use client";

import { useEffect } from "react";

const EDITABLE_SELECTOR = 'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable]:not([contenteditable="false"])';

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(element?.closest(EDITABLE_SELECTOR));
}

/** Prevents browser copy and selection menus on displayed app content. */
export default function CopyProtection() {
  useEffect(() => {
    const preventClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
    };
    const preventStaticSelection = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };

    document.addEventListener("copy", preventClipboard, true);
    document.addEventListener("cut", preventClipboard, true);
    document.addEventListener("selectstart", preventStaticSelection, true);
    document.addEventListener("contextmenu", preventStaticSelection, true);
    return () => {
      document.removeEventListener("copy", preventClipboard, true);
      document.removeEventListener("cut", preventClipboard, true);
      document.removeEventListener("selectstart", preventStaticSelection, true);
      document.removeEventListener("contextmenu", preventStaticSelection, true);
    };
  }, []);

  return null;
}
