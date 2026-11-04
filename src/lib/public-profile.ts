import { createAdminClient } from "@/lib/supabase/admin";
import { withPlaceNames } from "@/lib/place-names";
import { reviewsReceivedByUser, type ProfileReview, type RatingAggregate } from "@/lib/ratings";

type Localized = { name_en: string; name_ar: string };

export type PublicProfile = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  headline: string | null;
  intro: string | null;
  category: { slug: string } & Localized;
  /** Area and district ("Ras Beyrouth, Beirut"), or the governorate for older profiles. */
  place: Localized | null;
  /** Home Maintenance: the trades they do, for "Get a quote". */
  trades: string[];
  yearsExperience: number | null;
  rating: RatingAggregate;
  reviews: ProfileReview[];
  idChecked: boolean;
  /** Verified (blue check). */
  verified: boolean;
  memberSince: string;
  /** Approved work photos, a few. */
  workPhotos: { url: string; caption: string | null }[];
};

const MAX_WORK_PHOTOS = 6;
const MAX_REVIEWS = 3;

/**
 * A provider's profile as anyone with the link may see it: approved,
 * active, sharing switched on, account not suspended -- otherwise null.
 * Read with the service role and reduced to a fixed list of safe fields:
 * never a phone, email, nationality, exact address or the owner's user id.
 * Seekers (families, customers) never have a public page.
 */
export async function loadPublicProfile(profileId: string): Promise<PublicProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const db = createAdminClient();
  const { data: found } = await db
    .from("generic_profiles")
    .select("id, user_id, full_name, profile_photo_url, headline, attributes, role, status, moderation_status, public_page, location_id, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)")
    .eq("id", profileId)
    .maybeSingle();
  if (!found || found.role !== "provider" || found.status !== "active" || found.moderation_status !== "approved" || !found.public_page) return null;
  if (!found.categories) return null;

  const [{ data: owner }, [placed], reviews, { data: idDoc }, { data: projects }] = await Promise.all([
    db.from("users").select("status, created_at, featured_until").eq("id", found.user_id).maybeSingle(),
    withPlaceNames([found]),
    reviewsReceivedByUser(found.user_id),
    db.from("id_documents").select("status").eq("profile_id", profileId).maybeSingle(),
    db
      .from("work_projects")
      .select("position, work_photos(url, caption, position)")
      .eq("profile_id", profileId)
      .eq("status", "approved")
      .order("position", { ascending: true }),
  ]);
  if (!owner || owner.status === "suspended") return null;

  const a = (found.attributes ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const place = Array.isArray(placed.locations) ? placed.locations[0] : placed.locations;
  const workPhotos = (projects ?? [])
    .flatMap((p) => [...(p.work_photos ?? [])].sort((x, y) => x.position - y.position))
    .slice(0, MAX_WORK_PHOTOS)
    .map((p) => ({ url: p.url, caption: p.caption }));

  return {
    id: found.id,
    fullName: found.full_name,
    photoUrl: found.profile_photo_url,
    headline: found.headline,
    intro: text(a.shortIntro) ?? text(a.bio),
    category: found.categories,
    place: place ? { name_en: place.name_en, name_ar: place.name_ar } : null,
    trades: Array.isArray(a.trades) ? a.trades.filter((x): x is string => typeof x === "string") : [],
    yearsExperience: typeof a.yearsExperience === "number" && a.yearsExperience > 0 ? a.yearsExperience : null,
    rating: { average: reviews.average, count: reviews.count },
    reviews: reviews.reviews.filter((r) => r.comment).slice(0, MAX_REVIEWS),
    idChecked: idDoc?.status === "approved",
    verified: !!owner?.featured_until && new Date(owner.featured_until) > new Date(),
    memberSince: owner.created_at,
    workPhotos,
  };
}
