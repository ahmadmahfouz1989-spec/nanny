"use client";

import { useEffect, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { META_EVENTS_COOKIE, META_PIXEL_ID, STANDARD_META_EVENTS, type BrowserMetaEvent, type MetaParams, type QueuedMetaEvent } from "@/lib/meta-events";
import { isNativeApp } from "@/lib/native-app";
import { APP_USER_AGENT_MARKER } from "@/lib/app-user-agent";

// Meta (Facebook) Pixel, for measuring ads. Every event is also sent from
// the server (Conversions API, lib/meta-capi.ts) under the same event ID:
// page views, profile views and searches through /api/meta/event, and the
// rest (sign-ups, requests, first messages...) by the routes that do them,
// which leave them in a cookie for the Pixel to send too.

// Only the live site reports to Meta: local development would otherwise
// count as real visits.
const ENABLED = process.env.NODE_ENV === "production" && META_PIXEL_ID !== "off";

type Fbq = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fbq;
  }
}

// Meta's base code, minus its built-in PageView: that one only fires on a
// full page load, and this app moves between pages without reloading.
// MetaPixel below sends a PageView on every page change instead.
// autoConfig off stops the pixel collecting button text and page details on
// its own -- it only gets the events sent explicitly here (see the Terms,
// section 6).
const BASE_CODE = `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('set', 'autoConfig', false, '${META_PIXEL_ID}');
fbq('init', '${META_PIXEL_ID}');
`;

// The admin panel is staff-only and not something ads should learn from.
function isTracked(pathname: string) {
  return !/^\/(en|ar|fr)?\/?admin(\/|$)/.test(pathname);
}

// Inside the iOS/Android app there's no Pixel at all: tracking there would
// need Apple's "Allow tracking?" prompt (App Tracking Transparency), and the
// website is where ads send people anyway. The server skips app requests too.
function inApp() {
  return isNativeApp() || navigator.userAgent.includes(APP_USER_AGENT_MARKER);
}
const noopSubscribe = () => () => {};

function pixelSend(name: string, params: MetaParams | undefined, eventId: string) {
  window.fbq?.(STANDARD_META_EVENTS.has(name) ? "track" : "trackCustom", name, params ?? {}, { eventID: eventId });
}

// The base code runs after hydration, so on the very first page fbq may
// not exist yet -- wait for it briefly rather than miss that visit.
function whenPixelReady(fn: () => void) {
  let tries = 0;
  const timer = setInterval(() => {
    if (window.fbq || ++tries > 50) {
      clearInterval(timer);
      if (window.fbq) fn();
    }
  }, 100);
  return () => clearInterval(timer);
}

/** A browser-side event: to the Pixel, and to the server's copy under the same ID. */
function trackMetaEvent(name: BrowserMetaEvent, params?: MetaParams) {
  const eventId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  void fetch("/api/meta/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, eventId, url: location.href, params }),
    keepalive: true,
  }).catch(() => {});
  return whenPixelReady(() => pixelSend(name, params, eventId));
}

// Events the server reported (see META_EVENTS_COOKIE), sent by the Pixel
// once it's loaded.
function sendQueuedEvents() {
  if (!window.fbq) return;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${META_EVENTS_COOKIE}=`))
    ?.slice(META_EVENTS_COOKIE.length + 1);
  if (!raw) return;
  document.cookie = `${META_EVENTS_COOKIE}=; Max-Age=0; path=/`;
  try {
    const queued = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))) as QueuedMetaEvent[];
    for (const e of queued) pixelSend(e.n, e.p, e.id);
  } catch {
    // a cookie from an older format -- drop it
  }
}

// Ad clicks arrive with ?fbclid=. The Pixel keeps it in _fbc; when an ad
// blocker stops the Pixel, keep it ourselves so the server's events can
// still be tied to the ad.
function rememberAdClick() {
  const fbclid = new URLSearchParams(location.search).get("fbclid");
  if (!fbclid || document.cookie.includes("_fbc=")) return;
  document.cookie = `_fbc=fb.1.${Date.now()}.${fbclid}; Max-Age=${90 * 86400}; path=/; SameSite=Lax`;
}

// What the page is, for Meta: a person's profile, or a category's page.
function pageContent(pathname: string): MetaParams | null {
  const profile = pathname.match(/^\/(?:en|ar|fr)?\/?u\/([^/]+)\/?$/);
  if (profile) return { content_type: "profile", content_ids: [profile[1]!] };
  const category = pathname.match(/^\/(?:en|ar|fr)?\/?categories\/([a-z-]+)(?:\/(?:dashboard|matches))?\/?$/);
  if (category) return { content_type: "category", content_category: category[1]! };
  return null;
}

export default function MetaPixel() {
  const pathname = usePathname();
  const query = useSearchParams().get("q")?.trim().slice(0, 100) ?? "";
  // Treated as "in the app" until known on the phone, so the server never
  // renders the script and the app never loads it.
  const app = useSyncExternalStore(noopSubscribe, inApp, () => true);
  const tracked = ENABLED && !app && isTracked(pathname);

  useEffect(() => {
    if (!tracked) return;
    rememberAdClick();
    const stops = [trackMetaEvent("PageView")];
    const content = pageContent(pathname);
    if (content) stops.push(trackMetaEvent("ViewContent", content));
    return () => stops.forEach((stop) => stop());
  }, [pathname, tracked]);

  useEffect(() => {
    if (!tracked || !query || !/\/search\/?$/.test(pathname)) return;
    return trackMetaEvent("Search", { search_string: query });
  }, [query, pathname, tracked]);

  // Most server events come back on a page change, but some (saving a
  // profile, a first message) don't navigate -- so check every few seconds.
  useEffect(() => {
    if (!ENABLED || app) return;
    const stop = whenPixelReady(sendQueuedEvents);
    const timer = setInterval(sendQueuedEvents, 3000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [pathname, app]);

  if (!ENABLED || app) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {BASE_CODE}
    </Script>
  );
}
