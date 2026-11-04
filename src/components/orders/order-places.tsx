"use client";

/// <reference types="google.maps" />

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { placeLabel } from "@/components/orders/order-bits";
import { loadGoogleMaps, mapsEnabled } from "@/lib/google-maps";
import type { OrderPlace, OrderRoute } from "@/lib/errand-order-view";

const PICKUP_COLOUR = "#ee4f26";
const DROPOFF_COLOUR = "#1f8577";

/**
 * An order's places: From and To, each with its name, address (or only
 * its area, before a rider confirms), instructions and contact, a small
 * map with both pins when Maps is set up, the distance between them, and
 * "Open in Google Maps" for directions from pickup to drop-off.
 */
export default function OrderPlaces({ pickup, dropoff, route, job = false }: { pickup: OrderPlace; dropoff: OrderPlace | null; route: OrderRoute; job?: boolean }) {
  const t = useTranslations("PlacePicker");
  const showMap = mapsEnabled() && !!pickup.point;
  return (
    <div className={ui.card + " flex flex-col gap-3 p-4"}>
      {showMap && <RouteMap pickup={pickup} dropoff={dropoff} />}
      <PlaceBlock place={pickup} label={job ? t("where") : dropoff ? t("from") : t("where")} colour={PICKUP_COLOUR} />
      {dropoff && <PlaceBlock place={dropoff} label={t("to")} colour={DROPOFF_COLOUR} />}
      {(route.km !== null || route.mapsUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm text-muted">{route.km !== null && dropoff ? t(route.approximate ? "distanceAbout" : "distance", { km: route.km }) : ""}</p>
          {route.mapsUrl && (
            <a href={route.mapsUrl} target="_blank" rel="noreferrer" className={ui.buttonSecondary + " px-4! py-2! text-sm"}>
              {t("openInMaps")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function PlaceBlock({ place, label, colour }: { place: OrderPlace; label: string; colour: string }) {
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
        {place.approximate && <p className="mt-1 text-xs text-muted">{t("approximateHint")}</p>}
      </div>
    </div>
  );
}

/** Both places on a small map; an approximate drop-off is a shaded area, not a pin. */
function RouteMap({ pickup, dropoff }: { pickup: OrderPlace; dropoff: OrderPlace | null }) {
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const key = `${pickup.point?.lat},${pickup.point?.lng},${dropoff?.point?.lat},${dropoff?.point?.lng},${dropoff?.approximate}`;

  useEffect(() => {
    let active = true;
    loadGoogleMaps(locale)
      .then(async (gm) => {
        const { Map, Circle } = (await gm.importLibrary("maps")) as google.maps.MapsLibrary;
        const { Marker } = (await gm.importLibrary("marker")) as google.maps.MarkerLibrary;
        if (!active || !el.current || !pickup.point) return;
        const map = new Map(el.current, { center: pickup.point, zoom: 14, disableDefaultUI: true, clickableIcons: false, gestureHandling: "cooperative" });
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

  return <div ref={el} className="h-44 overflow-hidden rounded-xl border border-border bg-surface-sunken" />;
}
