import { hiddenUserIds } from "@/lib/hidden-accounts";
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
  /** Years of experience they gave, when the service asks (null: not given). */
  years: number | null;
  /** Languages they speak, as codes (ar, en, fr). */
  languages: string[];
  /** When the profile was made: "Joined Oct 2026" until ratings come. */
  joinedAt: string;
  /** Up to three photos of their work, newest project first. */
  workPhotos: string[];
};

export type BrowseFilters = {
  /** Only people whose ID the team checked. */
  idChecked?: boolean;
  /** At least this many years of experience. */
  minYears?: number;
  /** Speaks this language (a code: ar, en, fr). */
  language?: string | null;
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
} & BrowseFilters): Promise<{ cards: BrowseCard[]; more: boolean; total: number } | null> {
  const db = createAdminClient();
  const { data: category } = await db.from("categories").select("id, status").eq("slug", options.slug).maybeSingle();
  if (!category || category.status !== "live") return null;

  let q = db
    .from("generic_profiles")
    .select("id, user_id, full_name, profile_photo_url, headline, attributes, location_id, created_at, locations(name_en, name_ar, name_fr)")
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
  const out = new Set([...(suspended ?? []).map((u) => u.id), ...(await hiddenUserIds())]);
  const shown = all.filter((r) => !out.has(r.user_id));

  const [ratings, verified, { data: idsOk }, { data: languageRows }] = await Promise.all([
    ratingAggregatesByUser(shown.map((r) => r.user_id)),
    featuredUserIds(shown.map((r) => r.user_id)),
    shown.length ? db.from("id_documents").select("profile_id").in("profile_id", shown.map((r) => r.id)).eq("status", "approved") : Promise.resolve({ data: [] }),
    db.from("languages").select("id, code"),
  ]);
  const checked = new Set((idsOk ?? []).map((d) => d.profile_id));
  const codeOf = new Map((languageRows ?? []).map((l) => [l.id, l.code]));
  const yearsOf = (a: Record<string, unknown>) => (typeof a.yearsExperience === "number" && a.yearsExperience > 0 ? a.yearsExperience : null);
  const languagesOf = (a: Record<string, unknown>) =>
    (Array.isArray(a.languageIds) ? a.languageIds : []).map((id) => codeOf.get(id as string)).filter((c): c is string => !!c);

  const visible = shown.filter((r) => {
    const a = (r.attributes ?? {}) as Record<string, unknown>;
    if (options.idChecked && !checked.has(r.id)) return false;
    if (options.minYears && (yearsOf(a) ?? 0) < options.minYears) return false;
    if (options.language && !languagesOf(a).includes(options.language)) return false;
    return true;
  });
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
  const [placed, { data: projects }] = await Promise.all([
    withPlaceNames(slice.map((x) => x.r)),
    slice.length
      ? db
          .from("work_projects")
          .select("profile_id, position, work_photos(url, position)")
          .in("profile_id", slice.map((x) => x.r.id))
          .eq("status", "approved")
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const workOf = new Map<string, string[]>();
  for (const project of projects ?? []) {
    const urls = [...(project.work_photos ?? [])].sort((a, b) => a.position - b.position).map((w) => w.url);
    workOf.set(project.profile_id, [...(workOf.get(project.profile_id) ?? []), ...urls].slice(0, 3));
  }

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
      years: yearsOf(a),
      languages: languagesOf(a),
      joinedAt: p.created_at,
      workPhotos: workOf.get(p.id) ?? [],
    };
  });
  return { cards, more: ranked.length > start + BROWSE_PAGE_SIZE, total: ranked.length };
}
