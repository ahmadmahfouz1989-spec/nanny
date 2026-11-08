"use client";

// A rider's phone position for delivery dispatch (see /api/rider-location).
// Only once the rider has said yes ("Share my location" on Orders), only
// while they're Available, and only while the app is open.

const ON_KEY = "rider-location-on";
export const RIDER_AVAILABILITY_EVENT = "rider-availability";

export function sharingOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSharing(on: boolean) {
  try {
    if (on) localStorage.setItem(ON_KEY, "1");
    else localStorage.removeItem(ON_KEY);
  } catch {
    // Storage off: they'll be asked again next time.
  }
}

export type ShareResult = "ok" | "denied" | "unavailable" | "offline";

/** Reads the position once and sends it. Asks for permission the first time. */
export function shareLocationOnce(): Promise<ShareResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve("unavailable");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch("/api/rider-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => null);
        const body = await res?.json().catch(() => null);
        resolve(body?.ok ? "ok" : body?.reason === "offline" ? "offline" : "unavailable");
      },
      (e) => resolve(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      // Rough and quick is enough (it's rounded to ~500 m anyway).
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 },
    );
  });
}

export function stopSharing() {
  setSharing(false);
  void fetch("/api/rider-location", { method: "DELETE" }).catch(() => {});
}
