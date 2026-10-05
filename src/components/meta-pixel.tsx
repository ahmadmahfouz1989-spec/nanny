"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

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
const BASE_CODE = `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
`;

// The admin panel is staff-only and not something ads should learn from.
function isTracked(pathname: string) {
  return !/^\/(en|ar|fr)?\/?admin(\/|$)/.test(pathname);
}

/** Sends a standard Meta event (e.g. "CompleteRegistration"). Safe to call anywhere; a no-op when the pixel is off. */
export function trackMetaEvent(name: string, params?: Record<string, unknown>) {
  if (ENABLED && typeof window !== "undefined") window.fbq?.("track", name, params);
}

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!ENABLED || !isTracked(pathname)) return;
    // The base code runs after hydration, so on the very first page fbq may
    // not exist yet -- wait for it briefly rather than miss that visit.
    let tries = 0;
    const timer = setInterval(() => {
      if (window.fbq || ++tries > 50) {
        clearInterval(timer);
        window.fbq?.("track", "PageView");
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname]);

  if (!ENABLED) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {BASE_CODE}
    </Script>
  );
}
