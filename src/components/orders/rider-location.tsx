"use client";

import { useEffect, useRef } from "react";
import { RIDER_AVAILABILITY_EVENT, shareLocationOnce, sharingOn } from "@/lib/rider-location";

const EVERY_MS = 3 * 60_000;

/**
 * In the app frame for an approved rider: while they're Available, have
 * said yes to sharing, and have the app open, sends where the phone is
 * every few minutes so orders near them reach them first. Silent; the
 * Orders page is where it's switched on and explained.
 */
export default function RiderLocation({ available }: { available: boolean }) {
  const on = useRef(available);

  useEffect(() => {
    const send = () => {
      if (on.current && sharingOn() && document.visibilityState === "visible") void shareLocationOnce();
    };
    const onAvailability = (e: Event) => {
      on.current = !!(e as CustomEvent<boolean>).detail;
      send();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") send();
    };
    send();
    const timer = setInterval(send, EVERY_MS);
    window.addEventListener(RIDER_AVAILABILITY_EVENT, onAvailability);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener(RIDER_AVAILABILITY_EVENT, onAvailability);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
