import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewsReceivedByUser, type ProfileReview, type RatingAggregate } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";
import { savedProfileIds } from "@/lib/saved-profiles";
import type { CriterionResult } from "@/lib/matching/generic-engine";

type Localized = { name_en: string; name_ar: string; name_fr: string };

export type ProfilePageProfile = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  role: "seeker" | "provider";
  location_id: string | null;
  attributes: Record<string, unknown>;
  moderation_status: string;
  locations: Localized | null;
  categories: { slug: string; name_en: string; name_ar: string } | null;
  languages: ({ id: string } & Localized)[];
};

/** One of the person's profiles, for the category tabs. */
export type ProfileTab = {
  id: string;
  role: "seeker" | "provider";
  slug: string;
  name_en: string;
  name_ar: string;
};

export type ProfileMatch = {
  id: string;
  status: string;
  score: number;
  breakdown: Record<string, CriterionResult>;
  viewerSide: "seeker" | "provider";
};

export type ProfilePageData = {
  profile: ProfilePageProfile;
  tabs: ProfileTab[];
  isOwn: boolean;
  featured: boolean;
  isSaved: boolean;
  /** The viewer's match with this profile, when they have one. */
  match: ProfileMatch | null;
  /** Whether the viewer has a profile that could match this one at all. */
  viewerCanMatch: boolean;
  rating: RatingAggregate;
  reviews: ProfileReview[];
  trust: { memberSince: string; phoneVerified: boolean; emailVerified: boolean };
};

const FIELDS =
  "id, user_id, full_name, profile_photo_url, role, location_id, attributes, category_id, moderation_status, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)";

/**
 * Everything the profile page (/u/[id]) shows about one profile and the
 * person behind it. `supabase` is the viewer's own client, so RLS decides
 * what's visible -- the profile itself and each of the person's other
 * profiles show only if the viewer could already see them on a card (their
 * own, an active and approved one, or a match they're talking to). The
 * owner's user id stays on the server. Returns null when the viewer can't
 * see the profile.
 *
 * Reputation, Featured and the trust facts are per account and read with
 * the service role, the same way match cards read them; the trust facts
 * are yes/no and a month, never the email or phone itself.
 */
export async function loadProfilePage(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  profileId: string,
): Promise<ProfilePageData | null> {
  const { data: row } = await supabase.from("generic_profiles").select(FIELDS).eq("id", profileId).maybeSingle();
  if (!row) return null;

  const { user_id: ownerId, category_id: categoryId, ...visible } = row;
  const isOwn = ownerId === viewerId;
  const attributes = (visible.attributes ?? {}) as Record<string, unknown>;
  const role = visible.role as "seeker" | "provider";

  const languageIds = Array.isArray(attributes.languageIds)
    ? attributes.languageIds.filter((x): x is string => typeof x === "string")
    : [];

  const [siblings, languages, reviews, featured, saved, owner, viewerProfile] = await Promise.all([
    supabase
      .from("generic_profiles")
      .select("id, role, created_at, categories(slug, name_en, name_ar)")
      .eq("user_id", ownerId)
      .neq("status", "draft")
      .order("created_at", { ascending: true }),
    languageIds.length > 0
      ? supabase.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds)
      : Promise.resolve({ data: [] }),
    reviewsReceivedByUser(ownerId),
    featuredUserIds([ownerId]),
    isOwn ? Promise.resolve(new Set<string>()) : savedProfileIds(supabase, viewerId, [profileId]),
    createAdminClient()
      .from("users")
      .select("created_at, email_verified_at, phone, phone_verified_at")
      .eq("id", ownerId)
      .maybeSingle(),
    isOwn
      ? Promise.resolve({ data: null })
      : supabase
          .from("generic_profiles")
          .select("id")
          .eq("user_id", viewerId)
          .eq("category_id", categoryId)
          .eq("role", role === "seeker" ? "provider" : "seeker")
          .neq("status", "draft")
          .maybeSingle(),
  ]);

  let match: ProfileMatch | null = null;
  if (viewerProfile.data) {
    const viewerSide = role === "seeker" ? "provider" : "seeker";
    const pair =
      viewerSide === "seeker"
        ? { seeker_profile_id: viewerProfile.data.id, provider_profile_id: profileId }
        : { seeker_profile_id: profileId, provider_profile_id: viewerProfile.data.id };
    const { data: m } = await supabase
      .from("generic_matches")
      .select("id, status, score, score_breakdown")
      .match(pair)
      .maybeSingle();
    if (m) {
      match = {
        id: m.id,
        status: m.status,
        score: Number(m.score),
        breakdown: (m.score_breakdown ?? {}) as unknown as Record<string, CriterionResult>,
        viewerSide,
      };
    }
  }

  const tabs: ProfileTab[] = (siblings.data ?? []).map((s) => ({
    id: s.id,
    role: s.role as "seeker" | "provider",
    slug: s.categories?.slug ?? "",
    name_en: s.categories?.name_en ?? "",
    name_ar: s.categories?.name_ar ?? "",
  }));

  const ownerRow = owner.data;
  return {
    profile: {
      ...visible,
      role,
      attributes,
      languages: languages.data ?? [],
    },
    tabs,
    isOwn,
    featured: featured.has(ownerId),
    isSaved: saved.has(profileId),
    match,
    viewerCanMatch: !!viewerProfile.data,
    rating: { average: reviews.average, count: reviews.count },
    reviews: reviews.reviews,
    trust: {
      memberSince: ownerRow?.created_at ?? new Date().toISOString(),
      // A WhatsApp sign-in proves the number, same as the account card on /profile.
      phoneVerified: !!(ownerRow?.phone_verified_at || ownerRow?.phone),
      emailVerified: !!ownerRow?.email_verified_at,
    },
  };
}
