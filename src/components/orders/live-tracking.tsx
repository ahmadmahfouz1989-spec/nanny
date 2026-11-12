"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TRACKING_CHECK_EVENT, TRACKING_STATE_EVENT, trackingState, type TrackingState } from "@/lib/delivery-tracking";
import { hasBackgroundLocation } from "@/lib/native-app";

/**
 * On the rider's own order page while the delivery is in progress: tells
 * them the customer can see where they are, or why not. The sending itself
 * is DeliveryTracker's, in the app frame, so it carries on across pages
 * (and, in the apps, in the background).
 */
export default function LiveTracking({ orderId }: { orderId: string }) {
  const t = useTranslations("Orders");
  const [state, setState] = useState<TrackingState>(() => (trackingState().orderId === orderId ? trackingState().state : "starting"));
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ state: TrackingState; orderId: string | null }>).detail;
      if (d.orderId === orderId || d.state === "off") setState(d.orderId === orderId ? d.state : "starting");
    };
    window.addEventListener(TRACKING_STATE_EVENT, on);
    // Just confirmed: start now rather than at the next check.
    window.dispatchEvent(new Event(TRACKING_CHECK_EVENT));
    return () => window.removeEventListener(TRACKING_STATE_EVENT, on);
  }, [orderId]);

  if (state === "denied" || state === "unavailable") {
    return <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink">{t(state === "denied" ? "trackingDenied" : "trackingUnavailable")}</p>;
  }
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-secondary-soft/60 px-4 py-3 text-sm text-ink">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${state === "on" ? "step-now bg-success" : "bg-muted"}`} />
      {hasBackgroundLocation() ? t("trackingOnApp") : t("trackingOn")}
    </p>
  );
}
