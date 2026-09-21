import { createAdminClient } from "@/lib/supabase/admin";

export type RatingAggregate = { average: number | null; count: number };

/**
 * Average + count of the ratings *received* by each of `rateeUserIds`,
 * keyed by user id. Merges `ratings` (nanny/parent) and `generic_ratings`
 * (nursing, tutoring, ...) -- a person's reputation is per-account, not
 * per-category, same as how a single users.id can hold profiles in
 * several categories at once. Goes through the service role: RLS on both
 * tables only exposes a user's own rows, but the aggregate is shown on
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
  const [{ data: legacy }, { data: generic }] = await Promise.all([
    admin.from("ratings").select("ratee_user_id, score").in("ratee_user_id", ids),
    admin.from("generic_ratings").select("ratee_user_id, score").in("ratee_user_id", ids),
  ]);

  const totals = new Map<string, { total: number; count: number }>();
  for (const row of [...(legacy ?? []), ...(generic ?? [])]) {
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

export type ProfileReview = { score: number; comment: string | null; createdAt: string };

/**
 * Every rating a user has received, from either table — aggregate plus
 * the individual reviews, newest first. Service role, since RLS on both
 * tables only exposes the caller's own rows.
 */
export async function reviewsReceivedByUser(
  userId: string,
): Promise<RatingAggregate & { reviews: ProfileReview[] }> {
  const admin = createAdminClient();
  const [{ data: legacy }, { data: generic }] = await Promise.all([
    admin.from("ratings").select("score, comment, created_at").eq("ratee_user_id", userId),
    admin.from("generic_ratings").select("score, comment, created_at").eq("ratee_user_id", userId),
  ]);

  const reviews: ProfileReview[] = [...(legacy ?? []), ...(generic ?? [])]
    .map((r) => ({ score: r.score, comment: r.comment, createdAt: r.created_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.score, 0) / count) * 10) / 10
    : null;

  return { average, count, reviews };
}

/**
 * Every rating a profile has received — aggregate plus the individual
 * reviews, newest first — for the profile-card "see all reviews" view.
 * Returns null when the profile doesn't exist.
 */
export async function reviewsForProfile(
  profileType: "parent" | "nanny",
  profileId: string,
): Promise<(RatingAggregate & { reviews: ProfileReview[] }) | null> {
  const admin = createAdminClient();
  const table = profileType === "parent" ? "parent_profiles" : "nanny_profiles";

  const { data: profile } = await admin.from(table).select("user_id").eq("id", profileId).maybeSingle();
  if (!profile) return null;

  return reviewsReceivedByUser(profile.user_id);
}

/** Same as reviewsForProfile, resolving a generic_profiles row instead. */
export async function reviewsForGenericProfile(
  profileId: string,
): Promise<(RatingAggregate & { reviews: ProfileReview[] }) | null> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("generic_profiles").select("user_id").eq("id", profileId).maybeSingle();
  if (!profile) return null;

  return reviewsReceivedByUser(profile.user_id);
}
