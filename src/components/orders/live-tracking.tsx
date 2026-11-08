"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const SEND_EVERY_MS = 15_000;

/**
 * On the rider's own order page while the delivery is in progress: where
 * their phone is, sent every 15 s so the customer can follow them on the
 * map. Only while this page is open (a website can't track in the
 * background); stops by itself once the order is delivered.
 */
export default function LiveTracking({ orderId }: { orderId: string }) {
  const t = useTranslations("Orders");
  const [state, setState] = useState<"starting" | "on" | "denied" | "unavailable">("starting");
  const lastSent = useRef(0);
  const latest = useRef<GeolocationPosition | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("unavailable");
      return;
    }
    const send = (pos: GeolocationPosition) => {
      lastSent.current = Date.now();
      void fetch(`/api/errand-orders/${orderId}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      }).catch(() => {});
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        setState("on");
        if (Date.now() - lastSent.current >= SEND_EVERY_MS) send(pos);
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    // Standing still sends no new positions: keep the customer's map fresh anyway.
    const timer = setInterval(() => {
      if (latest.current && Date.now() - lastSent.current >= SEND_EVERY_MS) send(latest.current);
    }, SEND_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
    };
  }, [orderId]);

  if (state === "denied" || state === "unavailable") {
    return <p className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink">{t(state === "denied" ? "trackingDenied" : "trackingUnavailable")}</p>;
  }
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-secondary-soft/60 px-4 py-3 text-sm text-ink">
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${state === "on" ? "bg-success" : "bg-muted"}`} />
      {t("trackingOn")}
    </p>
  );
}
