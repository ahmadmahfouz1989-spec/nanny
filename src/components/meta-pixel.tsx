"use client";

import { useEffect, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { META_SIGNUP_COOKIE } from "@/lib/meta-signup";
import { isNativeApp } from "@/lib/native-app";
import { APP_USER_AGENT_MARKER } from "@/lib/app-user-agent";

// Meta (Facebook) Pixel, for measuring ads. Not a secret -- it's in every
// visitor's page source anyway. Override with NEXT_PUBLIC_META_PIXEL_ID.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "4002285310066540";

// Only the live site reports to Meta: local development would otherwise
// count as real visits.
const ENABLED = process.env.NODE_ENV === "production" && PIXEL_ID !== "off";

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
fbq('set', 'autoConfig', false, '${PIXEL_ID}');
fbq('init', '${PIXEL_ID}');
`;

// The admin panel is staff-only and not something ads should learn from.
function isTracked(pathname: string) {
  return !/^\/(en|ar|fr)?\/?admin(\/|$)/.test(pathname);
}

/** Sends a standard Meta event (e.g. "CompleteRegistration"). Safe to call anywhere; a no-op when the pixel is off. */
export function trackMetaEvent(name: string, params?: Record<string, unknown>) {
  if (ENABLED && typeof window !== "undefined" && !inApp()) window.fbq?.("track", name, params);
}

// Inside the iOS/Android app there's no Pixel at all: tracking there would
// need Apple's "Allow tracking?" prompt (App Tracking Transparency), and the
// website is where ads send people anyway.
function inApp() {
  return isNativeApp() || navigator.userAgent.includes(APP_USER_AGENT_MARKER);
}
const noopSubscribe = () => () => {};

// A Google sign-up finishes on the server (/auth/callback), which leaves
// this cookie for the first page afterwards to report.
function takeSignupMarker(): boolean {
  if (!document.cookie.split("; ").includes(`${META_SIGNUP_COOKIE}=1`)) return false;
  document.cookie = `${META_SIGNUP_COOKIE}=; Max-Age=0; path=/`;
  return true;
}

export default function MetaPixel() {
  const pathname = usePathname();
  // Treated as "in the app" until known on the phone, so the server never
  // renders the script and the app never loads it.
  const app = useSyncExternalStore(noopSubscribe, inApp, () => true);

  useEffect(() => {
    if (!ENABLED || app || !isTracked(pathname)) return;
    // The base code runs after hydration, so on the very first page fbq may
    // not exist yet -- wait for it briefly rather than miss that visit.
    let tries = 0;
    const timer = setInterval(() => {
      if (window.fbq || ++tries > 50) {
        clearInterval(timer);
        window.fbq?.("track", "PageView");
        if (window.fbq && takeSignupMarker()) window.fbq("track", "CompleteRegistration");
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname, app]);

  if (!ENABLED || app) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {BASE_CODE}
    </Script>
  );
}
