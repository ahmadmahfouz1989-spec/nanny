"use client";

/// <reference types="google.maps" />

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { SearchIcon } from "@/components/home-icons";
import { LEBANON_CENTRE, loadGoogleMaps, type MapPlace } from "@/lib/google-maps";

type Suggestion = { id: string; main: string; secondary: string; prediction: google.maps.places.PlacePrediction };

/**
 * One end of a delivery -- From or To -- picked on Google Maps: search a
 * shop, business, address or area; use where the phone is; or drag the map
 * under the pin to any spot. Then the place's name, what to do there and
 * who to ask for. Pickup and drop-off are independent: neither has to be
 * where the customer is.
 */
export default function MapPlacePicker({ kind, value, onChange }: { kind: "pickup" | "dropoff"; value: MapPlace; onChange: (next: MapPlace) => void }) {
  const t = useTranslations("PlacePicker");
  const locale = useLocale();
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const places = useRef<google.maps.PlacesLibrary | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // The map's listeners outlive renders: read the latest value through refs.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const update = (patch: Partial<MapPlace>) => onChangeRef.current({ ...valueRef.current, ...patch });

  async function addressOf(point: { lat: number; lng: number }) {
    try {
      const { results } = (await geocoder.current?.geocode({ location: point })) ?? { results: [] };
      // Google's first answer is often a plus code ("VGP9+MX5, Beirut"): take
      // the first real address or place name instead.
      const readable = results.find((r) => !r.types.includes("plus_code") && !/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/.test(r.formatted_address));
      return readable?.formatted_address ?? "";
    } catch {
      return "";
    }
  }

  useEffect(() => {
    let active = true;
    loadGoogleMaps(locale)
      .then(async (gm) => {
        const [{ Map }, placesLib, { Geocoder }] = await Promise.all([
          gm.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          gm.importLibrary("places") as Promise<google.maps.PlacesLibrary>,
          gm.importLibrary("geocoding") as Promise<google.maps.GeocodingLibrary>,
        ]);
        if (!active || !mapEl.current) return;
        places.current = placesLib;
        geocoder.current = new Geocoder();
        const start = valueRef.current.point;
        map.current = new Map(mapEl.current, {
          center: start ?? LEBANON_CENTRE,
          zoom: start ? 17 : 9,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          // One finger moves the map: this map is for placing the pin.
          gestureHandling: "greedy",
        });
        // The pin stays in the middle; the place is wherever the map stops.
        map.current.addListener("dragend", async () => {
          const c = map.current?.getCenter();
          if (!c) return;
          const point = { lat: c.lat(), lng: c.lng() };
          update({ point });
          update({ point, address: await addressOf(point) });
        });
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // Once: the map keeps its own state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function search(text: string) {
    setQuery(text);
    const seq = ++searchSeq.current;
    if (text.trim().length < 2 || !places.current) {
      setSuggestions([]);
      return;
    }
    token.current ??= new places.current.AutocompleteSessionToken();
    places.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      sessionToken: token.current,
      includedRegionCodes: ["lb"],
      language: locale,
      locationBias: map.current?.getCenter() ?? undefined,
    })
      .then(({ suggestions: found }) => {
        if (seq !== searchSeq.current) return;
        setSuggestions(
          found
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 6)
            .map((p) => ({ id: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", prediction: p })),
        );
      })
      .catch(() => setSuggestions([]));
  }

  async function pick(s: Suggestion) {
    setSuggestions([]);
    setQuery("");
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      token.current = null; // a pick ends the search session
      const loc = place.location?.toJSON();
      if (!loc) return;
      update({ point: loc, address: place.formattedAddress ?? s.secondary, name: place.displayName ?? s.main });
      map.current?.panTo(loc);
      map.current?.setZoom(17);
    } catch {
      setError(t("searchFailed"));
    }
  }

  function useCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t("locationUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.current?.panTo(point);
        map.current?.setZoom(17);
        update({ point });
        update({ point, address: await addressOf(point) });
      },
      () => {
        setLocating(false);
        setError(t("locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  if (failed) return <p className="text-sm text-danger">{t("mapFailed")}</p>;

  const pickup = kind === "pickup";
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          dir="auto"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={pickup ? t("searchPickup") : t("searchDropoff")}
          aria-label={pickup ? t("searchPickup") : t("searchDropoff")}
          className={ui.input + " ps-9!"}
        />
        {suggestions.length > 0 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s)} className="flex w-full flex-col px-4 py-2.5 text-start hover:bg-surface-sunken">
                <span className="text-sm font-medium text-ink">{s.main}</span>
                {s.secondary && <span className="text-xs text-muted">{s.secondary}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={useCurrentLocation} disabled={locating} className={ui.buttonSecondary + " self-start px-4! py-2! text-sm"}>
        <span aria-hidden className="me-1.5">◎</span>
        {locating ? t("locating") : t("useCurrentLocation")}
      </button>

      <div className="relative h-52 overflow-hidden rounded-xl border border-border-strong bg-surface-sunken">
        <div ref={mapEl} className="absolute inset-0" />
        {/* The pin: the place is the map's centre. */}
        <svg viewBox="0 0 24 36" aria-hidden className="pointer-events-none absolute start-1/2 top-1/2 h-9 w-6 -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
          <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill={pickup ? "#ee4f26" : "#1f8577"} />
          <circle cx="12" cy="12" r="4.5" fill="#fff" />
        </svg>
      </div>
      <p className="-mt-1 text-xs text-muted">{value.point ? value.address || t("pinPlaced") : t("dragHint")}</p>
      {error && <p className="text-sm text-danger">{error}</p>}

      <label className="flex flex-col gap-1">
        <span className={ui.label}>{pickup ? t("shopName") : t("placeName")}</span>
        <input dir="auto" maxLength={160} className={ui.input} value={value.name} onChange={(e) => update({ name: e.target.value })} placeholder={pickup ? t("shopNamePlaceholder") : t("placeNamePlaceholder")} />
      </label>
      {/* items-end: a label wrapping to two lines doesn't push its box out of line. */}
      <div className="grid grid-cols-2 items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{pickup ? t("contactName") : t("recipientName")}</span>
          <input dir="auto" maxLength={80} autoComplete="off" className={ui.input} value={value.contactName} onChange={(e) => update({ contactName: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ui.label}>{pickup ? t("contactPhone") : t("recipientPhone")}</span>
          <input type="tel" inputMode="tel" maxLength={30} autoComplete="off" className={ui.input} value={value.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={ui.label}>{pickup ? t("pickupInstructions") : t("dropoffInstructions")}</span>
        <textarea dir="auto" rows={2} maxLength={500} className={ui.input} value={value.instructions} onChange={(e) => update({ instructions: e.target.value })} placeholder={pickup ? t("pickupInstructionsPlaceholder") : t("dropoffInstructionsPlaceholder")} />
      </label>
    </div>
  );
}
