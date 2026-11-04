"use client";

/// <reference types="google.maps" />

// Google Maps, loaded only when a page shows a map and only when a key is
// set (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, with the Maps JavaScript API,
// Places API (New) and Geocoding API enabled). Without a key the order form
// keeps the area search and the order page shows places as text, with
// "Open in Google Maps" links (those need no key).

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const mapsEnabled = () => MAPS_KEY.length > 0;

/** Lebanon, for the first view of a map before anything is picked. */
export const LEBANON_CENTRE = { lat: 33.8938, lng: 35.5018 };

let loading: Promise<typeof google.maps> | null = null;

/** Loads the Maps JavaScript API once (bootstrap loader, `importLibrary`). */
export function loadGoogleMaps(language: string): Promise<typeof google.maps> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (typeof window.google?.maps?.importLibrary === "function") return resolve(window.google.maps);
    const callback = "__ouiknowMapsReady";
    (window as unknown as Record<string, () => void>)[callback] = () => resolve(window.google.maps);
    const params = new URLSearchParams({
      key: MAPS_KEY,
      v: "weekly",
      loading: "async",
      language,
      region: "LB",
      callback,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("Google Maps didn't load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** A place on the map, as an order stores it. */
export type MapPlace = {
  point: { lat: number; lng: number } | null;
  address: string;
  name: string;
  instructions: string;
  contactName: string;
  contactPhone: string;
};

export const emptyMapPlace: MapPlace = { point: null, address: "", name: "", instructions: "", contactName: "", contactPhone: "" };
