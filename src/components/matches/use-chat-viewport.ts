"use client";

import { useEffect } from "react";

/**
 * Keeps an open chat on the part of the screen you can actually see. An iPhone
 * doesn't shrink the page for the keyboard: it scrolls the page up, and doesn't
 * always scroll it back, which took the header off the top and left a blank
 * gap under the message box. So the chat follows the visible area, and the
 * page behind it stays put (see html[data-chat] in globals.css).
 */
export function useChatViewport(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const visible = window.visualViewport;
    let settle: ReturnType<typeof setTimeout> | undefined;

    function sync() {
      const height = visible?.height ?? window.innerHeight;
      root.style.setProperty("--chat-height", `${height}px`);
      root.style.setProperty("--chat-top", `${visible?.offsetTop ?? 0}px`);
      root.dataset.keyboard = window.innerHeight - height > 120 ? "open" : "closed";
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    }
    // The keyboard is still moving when focus changes: check again once it has stopped.
    function syncAfterKeyboard() {
      sync();
      clearTimeout(settle);
      settle = setTimeout(sync, 350);
    }

    sync();
    visible?.addEventListener("resize", sync);
    visible?.addEventListener("scroll", sync);
    window.addEventListener("scroll", sync);
    window.addEventListener("focusin", syncAfterKeyboard);
    window.addEventListener("focusout", syncAfterKeyboard);
    return () => {
      clearTimeout(settle);
      visible?.removeEventListener("resize", sync);
      visible?.removeEventListener("scroll", sync);
      window.removeEventListener("scroll", sync);
      window.removeEventListener("focusin", syncAfterKeyboard);
      window.removeEventListener("focusout", syncAfterKeyboard);
      root.style.removeProperty("--chat-height");
      root.style.removeProperty("--chat-top");
      delete root.dataset.keyboard;
    };
  }, [open]);
}
