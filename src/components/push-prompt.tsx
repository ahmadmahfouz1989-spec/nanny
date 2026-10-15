"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { enablePush, pushSupport } from "@/lib/push-client";
import { enableNativePush, isNativeApp, nativePushOptedOut } from "@/lib/native-app";

// AppShell (and so this) mounts again on every page: register once per
// launch, and again only if the app language changes.
let nativeRegisteredLocale: string | null = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Turns notifications on without a banner of our own.
 *
 * In the iOS/Android apps: once per launch, asks if undecided (the apps
 * need no tap) and re-registers, which also keeps the token on the
 * signed-in account and current language -- unless push was turned off on
 * the Profile card.
 *
 * In a home-screen web app: browsers -- iOS strictly -- only show the
 * system dialog from a user gesture, so it asks on the first tap anywhere.
 * Only while the permission is undecided; once allowed or blocked, the
 * Profile card is the place to change it. Closing the dialog without
 * choosing asks again on the next launch.
 */
export default function PushPrompt() {
  const locale = useLocale();

  useEffect(() => {
    if (isNativeApp()) {
      if (nativeRegisteredLocale === locale || nativePushOptedOut()) return;
      nativeRegisteredLocale = locale;
      enableNativePush(locale).catch(() => {});
      return;
    }
    if (pushSupport() !== "supported" || !isStandalone() || Notification.permission !== "default") return;
    function ask() {
      enablePush(locale).catch(() => {});
    }
    document.addEventListener("click", ask, { once: true, capture: true });
    return () => document.removeEventListener("click", ask, { capture: true });
  }, [locale]);

  return null;
}
