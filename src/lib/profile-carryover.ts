import type { Json } from "@/lib/supabase/database.types";

export type EarlierProfile = {
  role: string;
  location_id: string | null;
  profile_photo_url: string | null;
  attributes: Json;
};

type Attributes = Record<string, unknown>;

const LOCATION_KEYS = ["districtId", "areaId", "locationDetail"];
// About the person, so true in any service they offer. Not copied to a
// request: there, nationality and languages can describe who's being sought.
const PROVIDER_KEYS = ["nationality", "gender", "languageIds", "coverDistrictIds"];

const attributesOf = (p: EarlierProfile) => (p.attributes && typeof p.attributes === "object" && !Array.isArray(p.attributes) ? (p.attributes as Attributes) : {});
const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v !== "");

/**
 * What a new profile can start with from someone's other profiles (most
 * recent first), so a second service doesn't start from scratch. Everything
 * here lands in a draft they check and edit before submitting. What's
 * particular to a service (subjects, rates, ID documents...) isn't copied.
 */
export function carryOver(earlier: EarlierProfile[], role: "seeker" | "provider") {
  const sameRoleFirst = [...earlier.filter((p) => p.role === role), ...earlier.filter((p) => p.role !== role)];
  const attributes: Attributes = {};

  // One profile's place, not a mix: an area from one with a district from another wouldn't match.
  const placed = sameRoleFirst.find((p) => p.location_id || LOCATION_KEYS.some((k) => filled(attributesOf(p)[k])));
  if (placed) {
    for (const key of LOCATION_KEYS) {
      const value = attributesOf(placed)[key];
      if (filled(value)) attributes[key] = value;
    }
  }

  let photo: string | null = null;
  if (role === "provider") {
    const providers = earlier.filter((p) => p.role === "provider");
    for (const key of PROVIDER_KEYS) {
      const from = providers.find((p) => filled(attributesOf(p)[key]));
      if (from) attributes[key] = attributesOf(from)[key];
    }
    photo = sameRoleFirst.find((p) => p.profile_photo_url)?.profile_photo_url ?? null;
  }

  return { location_id: placed?.location_id ?? null, profile_photo_url: photo, attributes: attributes as { [key: string]: Json } };
}
