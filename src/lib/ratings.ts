import { createAdminClient } from "@/lib/supabase/admin";

export type RatingAggregate = { average: number | null; count: number };

/**
 * Average + count of the ratings *received* by each of `rateeUserIds`,
 * keyed by user id, across every category -- a person's reputation is
 * per-account, not per-category, same as how a single users.id can hold
 * profiles in several categories at once. Goes through the service role:
 * RLS only exposes a user's own rows, but the aggregate is shown on
 * other people's match cards (same reasoning as the contact-details
 * route).
 */
export async function ratingAggregatesByUser(
  rateeUserIds: string[],
): Promise<Map<string, RatingAggregate>> {
  const out = new Map<string, RatingAggregate>();
  const ids = [...new Set(rateeUserIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const admin = createAdminClient();
  const { data: ratings } = await admin.from("generic_ratings").select("ratee_user_id, score").in("ratee_user_id", ids);

  const totals = new Map<string, { total: number; count: number }>();
  for (const row of ratings ?? []) {
    const agg = totals.get(row.ratee_user_id) ?? { total: 0, count: 0 };
    agg.total += row.score;
    agg.count += 1;
    totals.set(row.ratee_user_id, agg);
  }
  for (const [uid, { total, count }] of totals) {
    out.set(uid, { average: Math.round((total / count) * 10) / 10, count });
  }
  return out;
}

export async function ratingAggregateForUser(rateeUserId: string): Promise<RatingAggregate> {
  const map = await ratingAggregatesByUser([rateeUserId]);
  return map.get(rateeUserId) ?? { average: null, count: 0 };
}

// Who left a review, as far as a reader should be told: the side of the
// match the rater was on and which category it was in. Ratings are
// per-account, so one profile's reviews can come from several categories --
// the label has to come from each review's own match, not from the profile
// being viewed.
export type ReviewRater = { role: "seeker" | "provider"; categoryEn: string; categoryAr: string } | null;

export type ProfileReview = { score: number; comment: string | null; createdAt: string; rater: ReviewRater };

/**
 * Every rating a user has received -- aggregate plus the individual
 * reviews, newest first. Service role, since RLS only exposes the caller's
 * own rows.
 */
export async function reviewsReceivedByUser(
  userId: string,
): Promise<RatingAggregate & { reviews: ProfileReview[] }> {
  const admin = createAdminClient();
  const { data: ratings } = await admin
    .from("generic_ratings")
    .select("score, comment, created_at, rater_user_id, match_id")
    .eq("ratee_user_id", userId);

  const matchIds = [...new Set((ratings ?? []).map((r) => r.match_id as string))];
  const { data: matches } = matchIds.length
    ? await admin.from("generic_matches").select("id, seeker_profile_id, categories(name_en, name_ar)").in("id", matchIds)
    : { data: [] as { id: string; seeker_profile_id: string; categories: unknown }[] };
  const seekerProfileIds = [...new Set((matches ?? []).map((m) => m.seeker_profile_id as string))];
  const { data: seekerProfiles } = seekerProfileIds.length
    ? await admin.from("generic_profiles").select("id, user_id").in("id", seekerProfileIds)
    : { data: [] as { id: string; user_id: string }[] };

  const matchById = new Map((matches ?? []).map((m) => [m.id as string, m]));
  const seekerUserByProfile = new Map((seekerProfiles ?? []).map((p) => [p.id as string, p.user_id as string]));

  const reviews: ProfileReview[] = (ratings ?? [])
    .map((r) => {
      const match = matchById.get(r.match_id as string);
      const category = match?.categories as { name_en: string; name_ar: string } | null | undefined;
      const rater: ReviewRater =
        match && category
          ? {
              role: seekerUserByProfile.get(match.seeker_profile_id as string) === r.rater_user_id ? "seeker" : "provider",
              categoryEn: category.name_en,
              categoryAr: category.name_ar,
            }
          : null;
      return { score: r.score, comment: r.comment, createdAt: r.created_at, rater };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.score, 0) / count) * 10) / 10
    : null;

  return { average, count, reviews };
}

/**
 * Every rating a profile's owner has received -- aggregate plus the
 * individual reviews, newest first -- for the profile-card "see all
 * reviews" view. Returns null when the profile doesn't exist.
 */
export async function reviewsForProfile(
  profileId: string,
): Promise<(RatingAggregate & { reviews: ProfileReview[] }) | null> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("generic_profiles").select("user_id").eq("id", profileId).maybeSingle();
  if (!profile) return null;

  return reviewsReceivedByUser(profile.user_id);
}
