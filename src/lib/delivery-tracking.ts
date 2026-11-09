"use client";

import { hasBackgroundLocation, postJson, stopBackgroundLocation, watchBackgroundLocation } from "@/lib/native-app";

// The rider's live location during a delivery, for the customer's map.
// One tracker for the whole app (it lives across page changes): the apps
// keep sending from the background (native background location, native
// HTTP, a per-delivery key); the website sends while it's open. It starts
// when the rider has a delivery in progress and stops when they don't.

export type TrackingState = "off" | "starting" | "on" | "denied" | "unavailable";
export const TRACKING_STATE_EVENT = "delivery-tracking-state";
/** Fire after anything that may start or end a delivery (confirm, deliver, drop). */
export const TRACKING_CHECK_EVENT = "delivery-tracking-check";

const SEND_EVERY_MS = 15_000;

type Active = { orderId: string; token: string; expiresAt: string };
let active: Active | null = null;
let nativeWatch: string | null = null;
let webWatch: number | null = null;
let lastSent = 0;
let latest: { lat: number; lng: number; accuracy: number } | null = null;
let state: TrackingState = "off";
let notice = { title: "", message: "" };

function setState(next: TrackingState) {
  state = next;
  window.dispatchEvent(new CustomEvent(TRACKING_STATE_EVENT, { detail: { state, orderId: active?.orderId ?? null } }));
}
export const trackingState = () => ({ state, orderId: active?.orderId ?? null });

async function send(force = false) {
  if (!active || !latest) return;
  if (!force && Date.now() - lastSent < SEND_EVERY_MS) return;
  lastSent = Date.now();
  const body = (await postJson(`/api/errand-orders/${active.orderId}/location`, { ...latest, token: active.token }).catch(() => null)) as {
    reason?: string;
  } | null;
  // Delivered, cancelled or dropped meanwhile: stop.
  if (body?.reason === "not_active") void stop();
}

function onLocation(l: { lat: number; lng: number; accuracy: number }) {
  latest = l;
  if (state !== "on") setState("on");
  void send();
}

async function start(next: Active) {
  active = next;
  setState("starting");
  if (hasBackgroundLocation()) {
    nativeWatch = await watchBackgroundLocation(notice, onLocation, () => setState("denied")).catch(() => null);
    if (!nativeWatch) setState("unavailable");
    return;
  }
  if (!navigator.geolocation) return setState("unavailable");
  webWatch = navigator.geolocation.watchPosition(
    (p) => onLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
  );
}

async function stop() {
  if (nativeWatch) await stopBackgroundLocation(nativeWatch);
  if (webWatch !== null) navigator.geolocation.clearWatch(webWatch);
  nativeWatch = null;
  webWatch = null;
  active = null;
  latest = null;
  setState("off");
}

/** Asks the server whether a delivery is in progress, and starts or stops to match. */
export async function syncDeliveryTracking(text: { title: string; message: string }) {
  notice = text;
  const res = await fetch("/api/errand-orders/active-delivery").catch(() => null);
  if (!res?.ok) return;
  const body = (await res.json().catch(() => null)) as { orderId: string | null; token?: string; expiresAt?: string } | null;
  if (!body) return;
  if (!body.orderId) {
    if (active) await stop();
    return;
  }
  if (active?.orderId === body.orderId) {
    // Same delivery: a fresh key (they last six hours).
    active = { orderId: body.orderId, token: body.token!, expiresAt: body.expiresAt! };
    return;
  }
  if (active) await stop();
  await start({ orderId: body.orderId, token: body.token!, expiresAt: body.expiresAt! });
}

/** Standing still sends nothing new: keep the customer's map fresh anyway (while the page can run). */
export function keepFresh() {
  void send();
}
