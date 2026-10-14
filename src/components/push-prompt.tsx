"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { enablePush, pushSupport } from "@/lib/push-client";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Asks the installed (home-screen) app for push permission on the first tap
 * anywhere. Browsers -- iOS strictly -- only show the system dialog from a
 * user gesture, so this is as automatic as it can be: no banner of our own,
 * just the system "Allow notifications?" on first touch. Only while the
 * permission is undecided; once allowed or blocked, the Profile card is the
 * place to change it. Closing the dialog without choosing asks again on the
 * next launch.
 */
export default function PushPrompt() {
  const locale = useLocale();

  useEffect(() => {
    if (pushSupport() !== "supported" || !isStandalone() || Notification.permission !== "default") return;
    function ask() {
      enablePush(locale).catch(() => {});
    }
    document.addEventListener("click", ask, { once: true, capture: true });
    return () => document.removeEventListener("click", ask, { capture: true });
  }, [locale]);

  return null;
}
