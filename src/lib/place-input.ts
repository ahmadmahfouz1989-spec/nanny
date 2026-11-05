// What people type or paste into a place search, understood without Google:
// coordinates in any common form, and Google Maps links. Runs in the browser
// and on the server (no imports).

export type LatLng = { lat: number; lng: number };

/** Arabic digits and punctuation, typographic quotes: down to one plain form. */
function normalize(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/،/g, ",")
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/[º˚]/g, "°")
    .trim();
}

const valid = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 }
    : null;

const DMS_PART = String.raw`([NSEW])?\s*(\d{1,3})\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*"\s*)?([NSEW])?`;
const DMS = new RegExp(`^${DMS_PART}[\\s,;/]+${DMS_PART}$`, "i");
const DECIMAL = /^([NS])?\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[\s,;/]+([EW])?\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/i;
const COMMA_DECIMAL = /^(-?\d{1,2}),(\d+)\s+(-?\d{1,3}),(\d+)$/;

/**
 * Coordinates as text: 33°47'32.8"N 35°30'31.3"E (seconds), 33°47.5'N
 * 35°30.5'E (minutes), 33.7924, 35.5087 or 33.7924N 35.5087E (decimal),
 * also with Arabic digits. Null when it's anything else, so "12 34" stays a
 * search: bare whole numbers aren't taken for coordinates.
 */
export function parseCoordinates(input: string): LatLng | null {
  const text = normalize(input).replace(/[()[\]]/g, " ").trim();
  if (!text || text.length > 80) return null;

  const dms = DMS.exec(text);
  if (dms) {
    const part = (i: number) => {
      const value = Number(dms[i + 1]) + Number(dms[i + 2] ?? 0) / 60 + Number(dms[i + 3] ?? 0) / 3600;
      const hemi = (dms[i] ?? dms[i + 4] ?? "").toUpperCase();
      return { value: hemi === "S" || hemi === "W" ? -value : value, hemi };
    };
    const a = part(1);
    const b = part(6);
    // Longitude first ("35°30'E 33°47'N"): put them in order.
    return /[EW]/.test(a.hemi) || /[NS]/.test(b.hemi) ? valid(b.value, a.value) : valid(a.value, b.value);
  }

  const dec = DECIMAL.exec(text);
  if (dec) {
    const hasDecimal = dec[2]!.includes(".") || dec[5]!.includes(".");
    const hasHemisphere = !!(dec[1] || dec[3] || dec[4] || dec[6]);
    if (!hasDecimal && !hasHemisphere) return null;
    const latHemi = (dec[1] ?? dec[3] ?? "").toUpperCase();
    const lngHemi = (dec[4] ?? dec[6] ?? "").toUpperCase();
    return valid(Number(dec[2]) * (latHemi === "S" ? -1 : 1), Number(dec[5]) * (lngHemi === "W" ? -1 : 1));
  }

  const comma = COMMA_DECIMAL.exec(text);
  if (comma) return valid(Number(`${comma[1]}.${comma[2]}`), Number(`${comma[3]}.${comma[4]}`));
  return null;
}

export type MapsLink =
  /** Coordinates found in the link itself. */
  | { kind: "point"; point: LatLng }
  /** maps.app.goo.gl and the like: only the server can follow it. */
  | { kind: "short"; url: string }
  /** A link to a named place with no coordinates in it. */
  | { kind: "query"; text: string };

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);

/** A Google host we'll follow or read links from (google.com, google.com.lb, maps.google.fr...). */
export function isGoogleHost(host: string): boolean {
  // google.com, a country (google.fr), or com/co + a country (google.com.lb, google.co.uk).
  return /^(?:[a-z0-9-]+\.)*google\.(?:com|[a-z]{2}|com?\.[a-z]{2})$/i.test(host) || SHORT_HOSTS.has(host.toLowerCase());
}

const isMapsUrl = (u: URL) => /^(?:www\.)?google\./i.test(u.hostname) ? u.pathname.startsWith("/maps") : /^maps\.google\./i.test(u.hostname);

function pointInUrl(u: URL): LatLng | null {
  const raw = decodeURIComponent(u.href);
  // !3d...!4d... is the place's own pin; @lat,lng is only where the map was
  // looking, so it comes last.
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(raw);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  for (const key of ["q", "query", "ll", "sll", "destination", "daddr", "center", "viewpoint"]) {
    const value = u.searchParams.get(key);
    const point = value ? parseCoordinates(value.replace(/^loc:/i, "")) : null;
    if (point) return point;
  }
  const inPath = /\/(?:place|search|dir)\/(?:[^/]*\/)*?(-?\d{1,2}\.\d+)(?:,|%2C)\+?\s*(-?\d{1,3}\.\d+)/.exec(raw);
  if (inPath) return valid(Number(inPath[1]), Number(inPath[2]));
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(raw);
  return at ? valid(Number(at[1]), Number(at[2])) : null;
}

function namedPlace(u: URL): string | null {
  for (const key of ["q", "query", "destination", "daddr"]) {
    const value = u.searchParams.get(key)?.trim();
    if (value) return value;
  }
  const place = /\/place\/([^/@?]+)/.exec(u.pathname);
  return place ? decodeURIComponent(place[1]!).replace(/\+/g, " ").trim() || null : null;
}

/** A Google Maps link anywhere in the text ("Pharmacy Mazen https://maps.app.goo.gl/x"). Null when there isn't one. */
export function parseMapsLink(input: string): MapsLink | null {
  const text = normalize(input);
  const found = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:google\.[a-z.]{2,8}|goo\.gl|g\.co)\/[^\s<>"']*/i.exec(text);
  if (!found) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(found[0]) ? found[0] : `https://${found[0]}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || (host === "goo.gl" && url.pathname.startsWith("/maps")) || (host === "g.co" && url.pathname.startsWith("/kgs"))) {
    return { kind: "short", url: url.href };
  }
  if (!isGoogleHost(host) || !isMapsUrl(url)) return null;
  const point = pointInUrl(url);
  if (point) return { kind: "point", point };
  const name = namedPlace(url);
  return name ? { kind: "query", text: name } : null;
}

/** Straight-line kilometres between two points (haversine). */
export function straightLineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** A generous box around Lebanon. The server has the final say (nearest known place). */
const LEBANON = { south: 33.05, north: 34.7, west: 35.09, east: 36.63 };
const inLebanon = ({ lat, lng }: LatLng) => lat >= LEBANON.south && lat <= LEBANON.north && lng >= LEBANON.west && lng <= LEBANON.east;

/**
 * The spot to use, or null when it isn't in Lebanon. Coordinates typed the
 * wrong way round are put right: no spot in Lebanon can be mistaken for
 * another one that way.
 */
export function lebanonPoint(point: LatLng): LatLng | null {
  if (inLebanon(point)) return point;
  const swapped = { lat: point.lng, lng: point.lat };
  return inLebanon(swapped) ? swapped : null;
}

/** Google's English addresses spell it "Bayrut". */
export function cleanAddress(address: string): string {
  return address.replace(/\bBayrut\b/g, "Beirut");
}
