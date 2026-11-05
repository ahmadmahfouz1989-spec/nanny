"use client";

/// <reference types="google.maps" />

import { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { getJson, request } from "@/lib/request";
import { BriefcaseIcon, ChevronDownIcon, CloseIcon, SearchIcon } from "@/components/home-icons";
import { HomeIcon } from "@/components/nav-icons";
import { LEBANON_CENTRE, loadGoogleMaps, type MapPlace } from "@/lib/google-maps";
import { cleanAddress, lebanonPoint, parseCoordinates, parseMapsLink, straightLineKm, type LatLng } from "@/lib/place-input";
import type { SavedPlace } from "@/lib/saved-places";

type Suggestion = { id: string; main: string; secondary: string; prediction: google.maps.places.PlacePrediction };

const SAVED_CHANGED = "saved-places-changed";
/** Wait for a pause in typing: every Google search is billed. */
const SEARCH_DELAY_MS = 300;
/** Further in than this, the pin is exact enough to confirm. */
const CONFIRM_ZOOM = 15;
/** The map moved further than this from the confirmed spot: ask again. */
const MOVED_METRES = 4;
/** Whatever the phone does, "Finding you…" ends by then. */
const LOCATE_LIMIT_MS = 20_000;
/** Wait for the map to settle before looking up its address: every lookup is billed. */
const PREVIEW_DELAY_MS = 600;
/** Closer than this, the address already looked up is still the right one. */
const SAME_ADDRESS_METRES = 10;
/** A saved place this close is the same place. */
const SAME_SAVED_METRES = 50;
/** Moved this far from a place found by name, that name no longer applies. */
const NAME_APPLIES_METRES = 150;

const metresApart = (a: LatLng, b: LatLng) => straightLineKm(a, b) * 1000;

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function LocateIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  );
}

/**
 * One end of a delivery -- From or To. Search a shop, business, address or
 * area (Arabic or English), paste coordinates or a Google Maps link, pick a
 * saved place, use where the phone is, or move the map under the fixed pin
 * and confirm. Pickup and drop-off are independent: neither has to be where
 * the customer is.
 *
 * `value.point` is only ever a confirmed spot. Moving the map afterwards
 * clears it until it's confirmed again, so what's sent is what was shown.
 * A confirmed place folds up: the map locks (so a thumb on it scrolls the
 * page instead of moving the spot) until "Change" opens it again.
 */
export default function MapPlacePicker({
  kind,
  value,
  onChange,
  ride = false,
}: {
  kind: "pickup" | "dropoff";
  value: MapPlace;
  onChange: (next: MapPlace) => void;
  /** Moto Taxi: a person travels, nothing is handed to anyone. */
  ride?: boolean;
}) {
  const t = useTranslations("PlacePicker");
  const locale = useLocale();
  const mapEl = useRef<HTMLDivElement>(null);
  const searchEl = useRef<HTMLInputElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const places = useRef<google.maps.PlacesLibrary | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // The map's listeners outlive renders: read the latest through refs.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });
  const confirmed = useRef<LatLng | null>(value.point);
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const locateSeq = useRef(0);
  const previewSeq = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastLookup = useRef<{ point: LatLng; address: string } | null>(null);
  const editingRef = useRef(!value.point);
  // A name that came with a place found by name, not one the person typed.
  const autoName = useRef<{ name: string; point: LatLng } | null>(null);
  const searchBox = useRef<HTMLDivElement>(null);

  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(value.point ? 17 : 9);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [typedPoint, setTypedPoint] = useState<LatLng | null>(null);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [editing, setEditingState] = useState(!value.point);
  const [listOpen, setListOpen] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [preview, setPreview] = useState("");
  const [replacing, setReplacing] = useState<"home" | "work" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(!!(value.contactName || value.contactPhone));

  const setEditing = useCallback((next: boolean) => {
    editingRef.current = next;
    setEditingState(next);
    map.current?.setOptions({ gestureHandling: next ? "greedy" : "none", zoomControl: next });
  }, []);

  const update = (patch: Partial<MapPlace>) => {
    const next = { ...valueRef.current, ...patch };
    valueRef.current = next;
    onChangeRef.current(next);
  };

  const loadSaved = useCallback(() => {
    void getJson<{ places?: SavedPlace[] }>("/api/saved-places").then((body) => setSaved(body?.places ?? []));
  }, []);
  useEffect(() => {
    loadSaved();
    window.addEventListener(SAVED_CHANGED, loadSaved);
    return () => window.removeEventListener(SAVED_CHANGED, loadSaved);
  }, [loadSaved]);

  /** A readable address for a spot: Google's first answer is often a plus code. */
  async function addressOf(point: LatLng) {
    try {
      const { results } = (await geocoder.current?.geocode({ location: point })) ?? { results: [] };
      const readable = results.find((r) => !r.types.includes("plus_code") && !/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/.test(r.formatted_address));
      return cleanAddress(readable?.formatted_address ?? "");
    } catch {
      return "";
    }
  }
  /** Asking twice about the same spot would be paid for twice. */
  async function lookUp(point: LatLng) {
    const last = lastLookup.current;
    if (last && last.address && metresApart(last.point, point) < SAME_ADDRESS_METRES) return last.address;
    const address = await addressOf(point);
    lastLookup.current = { point, address };
    return address;
  }

  /** What's under the pin while the map moves, so a confirm isn't blind. */
  function schedulePreview(point: LatLng, closeEnough: boolean) {
    clearTimeout(previewTimer.current);
    const seq = ++previewSeq.current;
    setPreview("");
    if (!closeEnough) return;
    previewTimer.current = setTimeout(async () => {
      const address = await lookUp(point);
      if (seq === previewSeq.current) setPreview(address);
    }, PREVIEW_DELAY_MS);
  }

  /** Puts the pin exactly on a spot, confirmed: the spot itself is what's kept, not the map's centre. */
  function placeAt(point: LatLng, patch: Partial<MapPlace> = {}) {
    confirmed.current = point;
    setError(null);
    setJustSaved(null);
    setReplacing(null);
    setPreview("");
    previewSeq.current++;
    clearTimeout(previewTimer.current);
    // This place wins over a location request still under way.
    locateSeq.current++;
    setLocating(false);
    map.current?.setCenter(point);
    if ((map.current?.getZoom() ?? 0) < 17) map.current?.setZoom(17);
    setEditing(false);
    // A name is about one place: it doesn't follow the pin somewhere else,
    // unless the person typed it themselves.
    const current = valueRef.current.name;
    const name = patch.name || (autoName.current?.name === current ? "" : current);
    autoName.current = patch.name ? { name: patch.name, point } : null;
    update({ point, address: "", ...patch, name });
  }
  async function placeAtAndFindAddress(point: LatLng, patch: Partial<MapPlace> = {}) {
    placeAt(point, patch);
    const address = await lookUp(point);
    // Still the same spot by the time the address came back.
    if (confirmed.current === point) update({ address });
  }
  /** A spot from coordinates, a link or the phone: only places in Lebanon get as far as a tick. */
  function goTo(point: LatLng) {
    const spot = lebanonPoint(point);
    if (!spot) {
      setTypedPoint(null);
      setError(t("outsideLebanon"));
      return;
    }
    clearSearch();
    void placeAtAndFindAddress(spot);
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
        const instance = new Map(mapEl.current, {
          center: start ?? LEBANON_CENTRE,
          zoom: start ? 17 : 9,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          zoomControl: editingRef.current,
          // One finger moves the map while it's open; a confirmed place is locked.
          gestureHandling: editingRef.current ? "greedy" : "none",
        });
        map.current = instance;
        // "idle": the map has stopped, glide included. Reading it when the
        // finger lifts gave a spot the map then slid away from.
        instance.addListener("idle", () => {
          const level = instance.getZoom() ?? 9;
          setZoom(level);
          if (!editingRef.current) return;
          const c = instance.getCenter();
          if (!c) return;
          const here = { lat: c.lat(), lng: c.lng() };
          const done = confirmed.current;
          if (done && metresApart(done, here) <= MOVED_METRES) return;
          if (done) {
            confirmed.current = null;
            setJustSaved(null);
            update({ point: null, address: "" });
          }
          schedulePreview(here, level >= CONFIRM_ZOOM);
        });
      })
      .catch((e) => {
        console.error("[place-picker] map didn't load:", e);
        Sentry.captureException(e, { tags: { area: "place-picker", step: "load" } });
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // Once: the map keeps its own state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map's height changes as a place folds and opens: keep the spot in the middle.
  useEffect(() => {
    if (confirmed.current) map.current?.setCenter(confirmed.current);
  }, [editing]);

  // Changed from outside (swapped ends, a restored draft): follow it.
  useEffect(() => {
    if (value.point === confirmed.current) return;
    confirmed.current = value.point;
    autoName.current = null;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPreview("");
    setError(null);
    setEditing(!value.point);
    // Contact details that arrived with it shouldn't be sent unseen.
    if (value.contactName || value.contactPhone) setDetailsOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (value.point) {
      map.current?.setCenter(value.point);
      if ((map.current?.getZoom() ?? 0) < 17) map.current?.setZoom(17);
    }
    // Only when the spot itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.point, setEditing]);

  // Tapping elsewhere closes the results.
  useEffect(() => {
    if (!listOpen) return;
    const close = (e: PointerEvent) => {
      if (!searchBox.current?.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [listOpen]);

  /** The pin is on the right spot: keep it. */
  async function confirmPin() {
    const c = map.current?.getCenter();
    if (!c) return;
    const point = { lat: c.lat(), lng: c.lng() };
    const held = valueRef.current.point;
    // Opened with "Change" and left where it was.
    if (held && metresApart(held, point) <= MOVED_METRES) {
      setError(null);
      setEditing(false);
      return;
    }
    // Not the swapped-coordinates rescue: the map really is looking there.
    if (lebanonPoint(point) !== point) {
      setError(t("outsideLebanon"));
      return;
    }
    confirmed.current = point;
    previewSeq.current++;
    clearTimeout(previewTimer.current);
    setError(null);
    setPreview("");
    setReplacing(null);
    setConfirming(true);
    setEditing(false);
    // Fine-tuning a found place keeps its name; going somewhere else doesn't.
    const named = autoName.current;
    const stale = named && metresApart(named.point, point) > NAME_APPLIES_METRES && valueRef.current.name === named.name;
    if (stale) autoName.current = null;
    update({ point, address: "", ...(stale ? { name: "" } : {}) });
    const address = await lookUp(point);
    setConfirming(false);
    if (confirmed.current === point) update({ address });
  }

  function clearSearch() {
    searchSeq.current++;
    clearTimeout(searchTimer.current);
    setQuery("");
    setSuggestions([]);
    setTypedPoint(null);
    setNoResults(false);
    setResolving(false);
    setLoadingPlace(false);
  }

  function runSearch(text: string) {
    const seq = ++searchSeq.current;
    clearTimeout(searchTimer.current);
    setNoResults(false);
    if (text.trim().length < 2 || !places.current) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      if (!places.current) return;
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
          const list = found
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 6)
            .map((p) => ({ id: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", prediction: p }));
          setSuggestions(list);
          setNoResults(list.length === 0);
        })
        .catch((e) => {
          console.error("[place-picker] search failed:", e);
          Sentry.captureException(e, { tags: { area: "place-picker", step: "search" } });
          if (seq === searchSeq.current) {
            setSuggestions([]);
            setError(t("searchFailed"));
          }
        });
    }, SEARCH_DELAY_MS);
  }

  async function followLink(url: string) {
    const seq = ++searchSeq.current;
    setResolving(true);
    setError(null);
    const body = await getJson<{ point?: LatLng; query?: string }>(`/api/maps-link?url=${encodeURIComponent(url)}`);
    // The box was cleared or changed while the link was being read: the answer is old news.
    if (seq !== searchSeq.current) return;
    setResolving(false);
    if (body?.point) {
      goTo(body.point);
    } else if (body?.query) {
      // The link names a place without saying where: search for it.
      setQuery(body.query);
      runSearch(body.query);
    } else {
      setError(t("linkFailed"));
    }
  }

  function search(text: string) {
    setQuery(text);
    setError(null);
    setListOpen(true);
    setResolving(false);
    setLoadingPlace(false);
    const point = parseCoordinates(text);
    setTypedPoint(point);
    if (point) {
      searchSeq.current++;
      clearTimeout(searchTimer.current);
      setSuggestions([]);
      setNoResults(false);
      return;
    }
    const link = parseMapsLink(text);
    if (link) {
      searchSeq.current++;
      clearTimeout(searchTimer.current);
      setSuggestions([]);
      setNoResults(false);
      if (link.kind === "point") {
        goTo(link.point);
      } else if (link.kind === "short") {
        void followLink(link.url);
      } else {
        setQuery(link.text);
        runSearch(link.text);
      }
      return;
    }
    runSearch(text);
  }

  /** Pasted coordinates are complete: go straight there. Typed ones wait for a tap, they may still be changing. */
  function onSearchPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const point = parseCoordinates(text);
    if (!point) return;
    e.preventDefault();
    setQuery(text);
    goTo(point);
  }

  /** Enter in the search box acts on it. It must never send the order. */
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setListOpen(false);
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (typedPoint) goTo(typedPoint);
    else if (suggestions[0]) void pick(suggestions[0]);
  }

  async function detailsOf(s: Suggestion): Promise<{ point: LatLng; address: string; name: string } | null> {
    // Twice: a phone on a weak connection often makes it the second time.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const place = s.prediction.toPlace();
        await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
        const point = place.location?.toJSON();
        if (point) return { point, address: cleanAddress(place.formattedAddress ?? s.secondary), name: place.displayName ?? s.main };
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    // Then another Google service, which can find the same place by its id.
    try {
      const { results } = (await geocoder.current?.geocode({ placeId: s.id })) ?? { results: [] };
      const loc = results[0]?.geometry.location;
      if (loc) return { point: { lat: loc.lat(), lng: loc.lng() }, address: cleanAddress(results[0]!.formatted_address), name: s.main };
    } catch (e) {
      lastError = lastError ?? e;
    }
    console.error("[place-picker] place not loaded:", s.id, lastError);
    Sentry.captureException(lastError ?? new Error("place had no location"), { tags: { area: "place-picker", step: "details" }, extra: { placeId: s.id } });
    return null;
  }

  async function pick(s: Suggestion) {
    clearSearch();
    const seq = searchSeq.current;
    setError(null);
    setLoadingPlace(true);
    const found = await detailsOf(s);
    token.current = null; // a pick ends the search session
    if (seq !== searchSeq.current) return;
    setLoadingPlace(false);
    if (found) placeAt(found.point, { address: found.address, name: found.name });
    else setError(t("searchFailed"));
  }

  function findMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t("locationUnavailable"));
      searchEl.current?.focus();
      return;
    }
    const seq = ++locateSeq.current;
    setLocating(true);
    const stop = () => {
      clearTimeout(limit);
      locateSeq.current++;
      setLocating(false);
    };
    const fail = (message: string) => {
      if (seq !== locateSeq.current) return;
      stop();
      setError(message);
      searchEl.current?.focus();
    };
    // Phones can sit on a location request forever without calling back
    // (a permission prompt, no signal): this always ends the wait.
    const limit = setTimeout(() => fail(t("locationTimeout")), LOCATE_LIMIT_MS);
    const found = (pos: GeolocationPosition) => {
      if (seq !== locateSeq.current) return;
      stop();
      goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    };
    const message = (e: GeolocationPositionError) => (e.code === e.PERMISSION_DENIED ? t("locationDenied") : e.code === e.TIMEOUT ? t("locationTimeout") : t("locationUnavailable"));
    // GPS first; indoors it often never settles, so then the quicker
    // Wi-Fi/mobile estimate.
    navigator.geolocation.getCurrentPosition(
      found,
      (e) => {
        if (e.code === e.PERMISSION_DENIED) return fail(message(e));
        navigator.geolocation.getCurrentPosition(found, (second) => fail(message(second)), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 30_000 },
    );
  }

  async function saveAs(savedKind: "home" | "work") {
    if (!value.point) return;
    // The one already saved is only replaced on a second, deliberate tap.
    if (saved.some((p) => p.kind === savedKind) && replacing !== savedKind) {
      setReplacing(savedKind);
      return;
    }
    setReplacing(null);
    const res = await request("/api/saved-places", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: savedKind, point: value.point, address: value.address || undefined, name: value.name.trim() || undefined }),
    });
    if (!res?.ok) {
      setError(t("saveFailed"));
      return;
    }
    setJustSaved(savedKind);
    window.dispatchEvent(new Event(SAVED_CHANGED));
  }

  async function removeSaved(id: string) {
    setSaved((list) => list.filter((p) => p.id !== id));
    const res = await request(`/api/saved-places?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res?.ok) setError(t("removeFailed"));
    window.dispatchEvent(new Event(SAVED_CHANGED));
  }

  if (failed) return <p className="text-sm text-danger">{t("mapFailed")}</p>;

  const pickup = kind === "pickup";
  const label = (p: SavedPlace) => (p.kind === "home" ? t("home") : p.kind === "work" ? t("work") : p.name || p.address || t("recentPlace"));
  const closeEnough = zoom >= CONFIRM_ZOOM;
  const isSaved = (savedKind: "home" | "work") => !!value.point && saved.some((p) => p.kind === savedKind && metresApart(p.point, value.point!) < SAME_SAVED_METRES);
  const contactLabels = ride ? { name: t("passengerName"), phone: t("passengerPhone") } : pickup ? { name: t("contactName"), phone: t("contactPhone") } : { name: t("recipientName"), phone: t("recipientPhone") };
  const showContact = !(ride && !pickup);
  const notePlaceholder = ride ? (pickup ? t("ridePickupNotePlaceholder") : t("rideDropoffNotePlaceholder")) : pickup ? t("pickupNotePlaceholder") : t("dropoffNotePlaceholder");
  const showList = listOpen && (!!typedPoint || suggestions.length > 0 || noResults);
  return (
    <div className="flex flex-col gap-3">
      {editing && saved.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {saved.map((p) => (
            <span key={p.id} className="flex max-w-60 shrink-0 items-center rounded-full border border-border-strong bg-surface text-sm text-ink">
              <button type="button" onClick={() => placeAt(p.point, { address: p.address ?? "", name: p.name ?? "" })} className="flex min-h-10 min-w-0 items-center gap-1.5 ps-3">
                {p.kind === "home" ? <HomeIcon className="h-4 w-4 shrink-0 text-muted" /> : p.kind === "work" ? <BriefcaseIcon className="h-4 w-4 shrink-0 text-muted" /> : <ClockIcon className="h-4 w-4 shrink-0 text-muted" />}
                <span className="truncate">{label(p)}</span>
              </button>
              <button type="button" aria-label={t("removeSaved", { place: label(p) })} onClick={() => void removeSaved(p.id)} className="flex min-h-10 shrink-0 items-center px-2.5 text-muted hover:text-ink">
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {editing && (
        <>
          <div ref={searchBox} className="relative">
            <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchEl}
              type="search"
              dir="auto"
              value={query}
              onChange={(e) => search(e.target.value)}
              onPaste={onSearchPaste}
              onKeyDown={onSearchKey}
              onFocus={() => setListOpen(true)}
              placeholder={pickup ? t("searchPickup") : t("searchDropoff")}
              aria-label={pickup ? t("searchPickup") : t("searchDropoff")}
              className={ui.input + " ps-9! pe-10! [&::-webkit-search-cancel-button]:appearance-none"}
            />
            {query && (
              <button type="button" aria-label={t("clearSearch")} onClick={() => { clearSearch(); setError(null); searchEl.current?.focus(); }} className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted hover:text-ink">
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
            {showList && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                {typedPoint && (
                  <button type="button" onClick={() => goTo(typedPoint)} className="flex w-full flex-col px-4 py-2.5 text-start hover:bg-surface-sunken">
                    <span className="text-sm font-medium text-ink">{t("goToCoordinates")}</span>
                    <span dir="ltr" className="text-start text-xs text-muted">
                      {typedPoint.lat}, {typedPoint.lng}
                    </span>
                  </button>
                )}
                {suggestions.map((s) => (
                  <button key={s.id} type="button" onClick={() => pick(s)} className="flex w-full flex-col px-4 py-2.5 text-start hover:bg-surface-sunken">
                    <span className="text-sm font-medium text-ink">{s.main}</span>
                    {s.secondary && <span className="text-xs text-muted">{s.secondary}</span>}
                  </button>
                ))}
                {noResults && <p className="px-4 py-3 text-sm text-muted">{t("noResults")}</p>}
              </div>
            )}
          </div>
          {(resolving || loadingPlace) && <p className="-mt-1 text-xs text-muted">{resolving ? t("readingLink") : t("loadingPlace")}</p>}

          <button type="button" onClick={findMyLocation} disabled={locating} className={ui.buttonSecondary + " gap-1.5 self-start px-4! py-2! text-sm"}>
            <LocateIcon className="h-4 w-4" />
            {locating ? t("locating") : t("useCurrentLocation")}
          </button>
          {error && <p className="-mt-1 text-sm text-danger">{error}</p>}
        </>
      )}

      {/* Locked once confirmed: a thumb on it scrolls the page. */}
      <div data-no-pull={editing ? "" : undefined} className={"relative overflow-hidden rounded-xl border border-border-strong bg-surface-sunken " + (editing ? "h-56" : "pointer-events-none h-32")}>
        <div ref={mapEl} className="absolute inset-0" />
        {/* The pin never moves: the map moves under it, and the spot is the map's centre. */}
        <svg viewBox="0 0 24 36" aria-hidden className="pointer-events-none absolute start-1/2 top-1/2 h-9 w-6 -translate-x-1/2 -translate-y-full rtl:translate-x-1/2">
          <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill={pickup ? "#ee4f26" : "#1f8577"} />
          <circle cx="12" cy="12" r="4.5" fill="#fff" />
        </svg>
      </div>

      {editing ? (
        <>
          {preview && !value.point && <p dir="auto" className="-mt-1 text-sm text-ink">{preview}</p>}
          <button type="button" disabled={!closeEnough} onClick={() => void confirmPin()} className={ui.buttonPrimary + " w-full bg-secondary! hover:bg-secondary! dark:text-ink"}>
            {t("confirmLocation")}
          </button>
          <p className="-mt-1 text-xs text-muted">{closeEnough ? t("moveHint") : t("zoomHint")}</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-success-soft px-3 py-2.5">
            <div className="min-w-0 flex-1">
              {value.name && <p dir="auto" className="truncate text-sm font-semibold text-ink">{value.name}</p>}
              <p dir="auto" className="text-sm text-success">✓ {confirming ? t("pinPlaced") : value.address || t("pinPlaced")}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className={ui.buttonSecondary + " shrink-0 px-3! py-1.5! text-xs"}>
              {t("changePlace")}
            </button>
          </div>
          {error && <p className="-mt-1 text-sm text-danger">{error}</p>}
          <div className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(["home", "work"] as const).map((k) =>
              justSaved === k ? (
                <span key={k} className="text-muted">{t(k === "home" ? "savedHome" : "savedWork")}</span>
              ) : isSaved(k) ? null : (
                <button key={k} type="button" className={ui.link} onClick={() => void saveAs(k)}>
                  {replacing === k ? t(k === "home" ? "replaceHome" : "replaceWork") : t(k === "home" ? "saveHome" : "saveWork")}
                </button>
              ),
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className={ui.label}>{t("addressNote")}</span>
            <textarea dir="auto" rows={2} maxLength={500} className={ui.input} value={value.instructions} onChange={(e) => update({ instructions: e.target.value })} placeholder={notePlaceholder} />
          </label>

          <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((o) => !o)} className="flex items-center gap-1 self-start text-sm font-medium text-ink/80">
            {showContact ? t("addDetails") : t("addPlaceName")}
            <ChevronDownIcon className={"h-4 w-4 transition-transform " + (detailsOpen ? "rotate-180" : "")} />
          </button>
          {detailsOpen && (
            <>
              <label className="flex flex-col gap-1">
                <span className={ui.label}>{pickup && !ride ? t("shopName") : t("placeName")}</span>
                <input
                  dir="auto"
                  maxLength={160}
                  className={ui.input}
                  value={value.name}
                  onChange={(e) => {
                    autoName.current = null;
                    update({ name: e.target.value });
                  }}
                  placeholder={pickup && !ride ? t("shopNamePlaceholder") : t("placeNamePlaceholder")}
                />
              </label>
              {showContact && (
                // items-end: a label wrapping to two lines doesn't push its box out of line.
                <div className="grid grid-cols-2 items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className={ui.label}>{contactLabels.name}</span>
                    <input dir="auto" maxLength={80} autoComplete="off" className={ui.input} value={value.contactName} onChange={(e) => update({ contactName: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={ui.label}>{contactLabels.phone}</span>
                    <input type="tel" inputMode="tel" maxLength={30} autoComplete="off" className={ui.input} value={value.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
