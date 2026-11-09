"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TRACKING_CHECK_EVENT, keepFresh, syncDeliveryTracking } from "@/lib/delivery-tracking";

/**
 * In the app frame for an approved rider: shares their live location with
 * the customer while they have a delivery in progress (lib/delivery-tracking).
 * Checks on arrival, every minute, when the app comes back to the screen,
 * and right after they confirm, deliver or drop an order.
 */
export default function DeliveryTracker() {
  const t = useTranslations("Orders");
  useEffect(() => {
    const text = { title: t("trackingNoticeTitle"), message: t("trackingNoticeBody") };
    const check = () => void syncDeliveryTracking(text);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    const poll = setInterval(check, 60_000);
    const fresh = setInterval(keepFresh, 15_000);
    window.addEventListener(TRACKING_CHECK_EVENT, check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      // The tracker itself keeps going across pages; only the checks stop.
      clearInterval(poll);
      clearInterval(fresh);
      window.removeEventListener(TRACKING_CHECK_EVENT, check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [t]);
  return null;
}
