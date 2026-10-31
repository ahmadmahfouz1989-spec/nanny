// Shared between the browser Pixel (components/meta-pixel.tsx) and the
// server's Conversions API sender (lib/meta-capi.ts).

/** Not a secret -- it's in every visitor's page source anyway. Override with NEXT_PUBLIC_META_PIXEL_ID. */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1985845965431578";

// Events the server reports (sign-ups, posts, first messages...) are also
// left in this cookie for the Pixel to send under the same event ID, so
// Meta counts each once whichever of the two reaches it.
export const META_EVENTS_COOKIE = "meta_events";

export type MetaParams = Record<string, string | string[] | number>;
/** One event waiting in META_EVENTS_COOKIE: name, event ID, params. */
export type QueuedMetaEvent = { n: string; id: string; p?: MetaParams };

// Meta's own event names; anything else is sent as a custom event.
export const STANDARD_META_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Search",
  "CompleteRegistration",
  "Lead",
  "SubmitApplication",
  "Contact",
  "AddToWishlist",
]);

/** What the browser may report through /api/meta/event -- everything else happens on the server. */
export const BROWSER_META_EVENTS = ["PageView", "ViewContent", "Search"] as const;
export type BrowserMetaEvent = (typeof BROWSER_META_EVENTS)[number];
