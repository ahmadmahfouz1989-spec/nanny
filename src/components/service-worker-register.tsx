"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native-app";
import { APP_USER_AGENT_MARKER } from "@/lib/app-user-agent";

/**
 * Registers /sw.js (offline fallback only -- see the comment there). Skipped
 * in development so a stale worker never sits between `next dev` and the page.
 *
 * Never in the iOS/Android apps, which have their own offline screen and
 * native push: page requests a worker re-sends can lose the app's
 * user-agent marker, so the server would treat the app as a browser (see
 * isNativeAppRequest). A worker registered by an older version is removed.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (isNativeApp() || navigator.userAgent.includes(APP_USER_AGENT_MARKER)) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the site works the same without the offline page.
    });
  }, []);

  return null;
}
