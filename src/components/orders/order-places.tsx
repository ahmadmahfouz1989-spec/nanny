"use client";

/// <reference types="google.maps" />

import { useEffect, useRef, useState } from "react";
import { straightLineKm } from "@/lib/place-input";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { placeLabel } from "@/components/orders/order-bits";
import { loadGoogleMaps, mapsEnabled } from "@/lib/google-maps";
import type { OrderPlace, OrderRoute } from "@/lib/errand-order-view";

const PICKUP_COLOUR = "#ee4f26";
const DROPOFF_COLOUR = "#1f8577";
const RIDER_COLOUR = "#1688c8";

const directionsTo = (p: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;

/**
 * An order's places: From and To, each with its name, address (or only
 * its area, before a rider confirms), instructions and contact, a small
 * map with both pins when Maps is set up, the distance between them, and
 * "Open in Google Maps" for directions from pickup to drop-off.
 */
/** The rider during a delivery, for the customer: where they were, by whom, heading where. */
export type LiveRider = { lat: number; lng: number; at: string; name: string; toward: "pickup" | "dropoff" };

export default function OrderPlaces({
  pickup,
  dropoff,
  route,
  job = false,
  rider = false,
  live = null,
}: {
  pickup: OrderPlace;
  dropoff: OrderPlace | null;
  route: OrderRoute;
  job?: boolean;
  rider?: boolean;
  live?: LiveRider | null;
}) {
  const t = useTranslations("PlacePicker");
  const showMap = mapsEnabled() && !!pickup.point;
  return (
    <div className={ui.card + " flex flex-col gap-3 p-4"}>
      {showMap && <RouteMap pickup={pickup} dropoff={dropoff} live={live} />}
      {live && <LiveLine live={live} target={live.toward === "pickup" ? pickup.point : (dropoff?.point ?? null)} />}
      <PlaceBlock place={pickup} label={job ? t("where") : dropoff ? t("from") : t("where")} colour={PICKUP_COLOUR} rider={rider} />
      {dropoff && <PlaceBlock place={dropoff} label={t("to")} colour={DROPOFF_COLOUR} rider={rider} />}
      {(route.km !== null || route.mapsUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {/* Two places in the same area (no exact points) are "0 km" apart: say nothing. */}
          <p className="text-sm text-muted">{route.km !== null && route.km >= 0.1 && dropoff ? t("distanceAbout", { km: route.km }) : ""}</p>
          <div className="flex flex-wrap gap-2">
            {/* For the rider, directions from where they are now. An area isn't a destination. */}
            {rider && dropoff && pickup.point && (
              <a href={directionsTo(pickup.point)} target="_blank" rel="noreferrer" className={ui.buttonSecondary + " px-4! py-2! text-sm"}>
                {t("navigateToPickup")}
              </a>
            )}
            {rider && dropoff?.point && !dropoff.approximate && (
              <a href={directionsTo(dropoff.point)} target="_blank" rel="noreferrer" className={ui.buttonSecondary + " px-4! py-2! text-sm"}>
                {t("navigateToDropoff")}
              </a>
            )}
            {route.mapsUrl && (
              <a href={route.mapsUrl} target="_blank" rel="noreferrer" className={ui.buttonSecondary + " px-4! py-2! text-sm"}>
                {t("openInMaps")}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceBlock({ place, label, colour, rider }: { place: OrderPlace; label: string; colour: string; rider: boolean }) {
  const t = useTranslations("PlacePicker");
  const locale = useLocale();
  const area = [placeLabel(place.area, locale), placeLabel(place.district, locale)].filter(Boolean).join(", ");
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {place.name && (
          <p dir="auto" className="font-medium text-ink">
            {place.name}
          </p>
        )}
        <p dir="auto" className="text-sm text-ink/80">
          {place.address || area}
        </p>
        {place.address && area && <p className="text-xs text-muted">{area}</p>}
        {place.detail && (
          <p dir="auto" className="text-sm text-muted">
            {place.detail}
          </p>
        )}
        {place.instructions && (
          <p dir="auto" className="mt-1 whitespace-pre-line text-sm text-ink">
            {place.instructions}
          </p>
        )}
        {(place.contactName || place.contactPhone) && (
          <p className="mt-1 text-sm text-ink">
            {place.contactName}
            {place.contactName && place.contactPhone ? " · " : ""}
            {place.contactPhone && (
              <a href={`tel:${place.contactPhone.replace(/[^\d+]/g, "")}`} className={ui.link} dir="ltr">
                {place.contactPhone}
              </a>
            )}
          </p>
        )}
        {/* Only the rider waits for the exact place; the customer typed it. */}
        {place.approximate && rider && <p className="mt-1 text-xs text-muted">{t("approximateHint")}</p>}
      </div>
    </div>
  );
}

/** Both places on a small map; an approximate drop-off is a shaded area, not a pin. */
function RouteMap({ pickup, dropoff, live }: { pickup: OrderPlace; dropoff: OrderPlace | null; live: LiveRider | null }) {
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const riderMarker = useRef<google.maps.Marker | null>(null);
  const key = `${pickup.point?.lat},${pickup.point?.lng},${dropoff?.point?.lat},${dropoff?.point?.lng},${dropoff?.approximate}`;

  useEffect(() => {
    let active = true;
    loadGoogleMaps(locale)
      .then(async (gm) => {
        const { Map, Circle } = (await gm.importLibrary("maps")) as google.maps.MapsLibrary;
        const { Marker } = (await gm.importLibrary("marker")) as google.maps.MarkerLibrary;
        if (!active || !el.current || !pickup.point) return;
        const map = new Map(el.current, { center: pickup.point, zoom: 14, disableDefaultUI: true, clickableIcons: false, keyboardShortcuts: false, gestureHandling: "cooperative" });
        mapRef.current = map;
        riderMarker.current = null;
        const dot = (colour: string) => ({ path: gm.SymbolPath.CIRCLE, scale: 8, fillColor: colour, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 });
        new Marker({ map, position: pickup.point, icon: dot(PICKUP_COLOUR) });
        const bounds = new gm.LatLngBounds(pickup.point);
        if (dropoff?.point) {
          if (dropoff.approximate) {
            new Circle({ map, center: dropoff.point, radius: 1200, fillColor: DROPOFF_COLOUR, fillOpacity: 0.15, strokeColor: DROPOFF_COLOUR, strokeOpacity: 0.5, strokeWeight: 1 });
          } else {
            new Marker({ map, position: dropoff.point, icon: dot(DROPOFF_COLOUR) });
          }
          bounds.extend(dropoff.point);
          map.fitBounds(bounds, 40);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Redrawn when the places change (e.g. once a rider confirms).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale]);

  // The rider's dot moves with each update; the map is fitted to show them
  // the first time they appear, then left where the customer put it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === "undefined") return;
    if (!live) {
      riderMarker.current?.setMap(null);
      riderMarker.current = null;
      return;
    }
    const at = { lat: live.lat, lng: live.lng };
    if (riderMarker.current) {
      riderMarker.current.setPosition(at);
      return;
    }
    riderMarker.current = new google.maps.Marker({
      map,
      position: at,
      zIndex: 10,
      title: live.name,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: RIDER_COLOUR, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
    });
    const bounds = new google.maps.LatLngBounds(at);
    if (pickup.point) bounds.extend(pickup.point);
    if (dropoff?.point) bounds.extend(dropoff.point);
    map.fitBounds(bounds, 40);
  }, [live, pickup.point, dropoff?.point]);

  return <div ref={el} className={`overflow-hidden rounded-xl border border-border bg-surface-sunken ${live ? "h-60" : "h-44"}`} />;
}

/** "Hadi is about 1.2 km from the pickup · updated 20 s ago", kept current between updates. */
function LiveLine({ live, target }: { live: LiveRider; target: { lat: number; lng: number } | null }) {
  const t = useTranslations("Orders");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - Date.parse(live.at)) / 1000));
  const ago = seconds < 60 ? t("trackingSecondsAgo", { n: seconds }) : t("trackingMinutesAgo", { n: Math.round(seconds / 60) });
  const km = target ? straightLineKm({ lat: live.lat, lng: live.lng }, target) : null;
  return (
    <p className="flex items-center gap-2 text-sm text-ink" aria-live="polite">
      <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden" style={{ background: RIDER_COLOUR }} />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: RIDER_COLOUR }} />
      </span>
      <span>
        {km === null
          ? t("trackingLive", { name: live.name })
          : km < 0.15
            ? t(live.toward === "pickup" ? "trackingAtPickup" : "trackingAtDropoff", { name: live.name })
            : t(live.toward === "pickup" ? "trackingToPickup" : "trackingToDropoff", { name: live.name, km: Math.round(km * 10) / 10 })}
        <span className="text-muted"> · {ago}</span>
      </span>
    </p>
  );
}
