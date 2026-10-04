"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (offline fallback only -- see the comment there). Skipped
 * in development so a stale worker never sits between `next dev` and the page.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the site works the same without the offline page.
    });
  }, []);

  return null;
}
