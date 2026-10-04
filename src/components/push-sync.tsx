"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { syncPushSubscription } from "@/lib/push-client";

/** Keeps this device's push subscription on the signed-in account and current language. */
export default function PushSync() {
  const locale = useLocale();
  useEffect(() => {
    syncPushSubscription(locale);
  }, [locale]);
  return null;
}
