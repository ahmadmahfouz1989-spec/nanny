import { createAdminClient } from "@/lib/supabase/admin";
import { withPlaceNames } from "@/lib/place-names";
import { ratingAggregatesByUser, type RatingAggregate } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";

export const BROWSE_PAGE_SIZE = 24;

export type BrowseCard = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  headline: string | null;
  place: { name_en: string; name_ar: string } | null;
  rating: RatingAggregate;
  /** Home Maintenance trades / Delivery & Errands services, as codes. */
  services: string[];
  idChecked: boolean;
  /** Verified (blue check): shown first. */
  verified: boolean;
};

/**
 * One service's providers, for anyone (signed in or not): approved,
 * active, public page on, account not suspended. `region` is a governorate
 * or a district (where they live or one they cover); `service` narrows to
 * a trade or an errand service. Read on the server and reduced to the same
 * safe fields as the public profile page. Verified people first, then
 * profiles with a photo and good ratings.
 */
export async function browseProviders(options: {
  slug: string;
  region: string | null;
  service: string | null;
  page: number;
}): Promise<{ cards: BrowseCard[]; more: boolean } | null> {
  const db = createAdminClient();
  const { data: category } = await db.from("categories").select("id, status").eq("slug", options.slug).maybeSingle();
  if (!category || category.status !== "live") return null;

  let q = db
    .from("generic_profiles")
    .select("id, user_id, full_name, profile_photo_url, headline, attributes, location_id, locations(name_en, name_ar, name_fr)")
    .eq("category_id", category.id)
    .eq("role", "provider")
    .eq("status", "active")
    .eq("moderation_status", "approved")
    .eq("public_page", true);

  if (options.region && /^[0-9a-f-]{36}$/i.test(options.region)) {
    const { data: place } = await db.from("locations").select("level, parent_location_id").eq("id", options.region).maybeSingle();
    if (place?.level === "district") {
      q = q.or(
        `attributes->>districtId.eq.${options.region},attributes->coverDistrictIds.cs.["${options.region}"]` +
          (place.parent_location_id ? `,and(attributes->>districtId.is.null,location_id.eq.${place.parent_location_id})` : ""),
      );
    } else if (place) {
      q = q.or(`location_id.eq.${options.region},attributes->serviceAreaIds.cs.["${options.region}"]`);
    }
  }
  if (options.service && /^[a-z_]{2,30}$/.test(options.service)) {
    const key = options.slug === "maintenance" ? "trades" : options.slug === "errands" ? "errandServices" : null;
    // A JSON array in attributes: contains, as JSON (not a Postgres array).
    if (key) q = q.filter(`attributes->${key}`, "cs", JSON.stringify([options.service]));
  }

  // Enough to rank the whole set (a few hundred at most per service today).
  const { data: rows } = await q.limit(500);
  const all = rows ?? [];
  const { data: suspended } = all.length
    ? await db.from("users").select("id").in("id", all.map((r) => r.user_id)).eq("status", "suspended")
    : { data: [] as { id: string }[] };
  const out = new Set((suspended ?? []).map((u) => u.id));
  const visible = all.filter((r) => !out.has(r.user_id));

  const [ratings, verified] = await Promise.all([
    ratingAggregatesByUser(visible.map((r) => r.user_id)),
    featuredUserIds(visible.map((r) => r.user_id)),
  ]);
  const ranked = visible
    .map((r) => ({ r, rating: ratings.get(r.user_id) ?? { average: null, count: 0 }, verified: verified.has(r.user_id) }))
    .sort(
      (a, b) =>
        Number(b.verified) - Number(a.verified) ||
        Number(!!b.r.profile_photo_url) - Number(!!a.r.profile_photo_url) ||
        (b.rating.average ?? 0) * Math.min(b.rating.count, 5) - (a.rating.average ?? 0) * Math.min(a.rating.count, 5) ||
        a.r.id.localeCompare(b.r.id),
    );

  const start = Math.max(0, options.page) * BROWSE_PAGE_SIZE;
  const slice = ranked.slice(start, start + BROWSE_PAGE_SIZE);
  const ids = slice.map((x) => x.r.id);
  const [placed, { data: ids_ok }] = await Promise.all([
    withPlaceNames(slice.map((x) => x.r)),
    ids.length ? db.from("id_documents").select("profile_id").in("profile_id", ids).eq("status", "approved") : Promise.resolve({ data: [] }),
  ]);
  const checked = new Set((ids_ok ?? []).map((d) => d.profile_id));

  const cards = placed.map((p, i) => {
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    const services = (options.slug === "maintenance" ? a.trades : options.slug === "errands" ? a.errandServices : []) as unknown;
    const place = Array.isArray(p.locations) ? p.locations[0] : p.locations;
    const intro = typeof a.shortIntro === "string" && a.shortIntro.trim() ? a.shortIntro.trim() : null;
    return {
      id: p.id,
      fullName: p.full_name,
      photoUrl: p.profile_photo_url,
      headline: p.headline ?? (intro ? intro.slice(0, 140) : null),
      place: place ? { name_en: place.name_en, name_ar: place.name_ar } : null,
      rating: slice[i]!.rating,
      services: Array.isArray(services) ? services.filter((x): x is string => typeof x === "string") : [],
      idChecked: checked.has(p.id),
      verified: slice[i]!.verified,
    };
  });
  return { cards, more: ranked.length > start + BROWSE_PAGE_SIZE };
}
