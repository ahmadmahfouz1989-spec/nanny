import { createAdminClient } from "@/lib/supabase/admin";

export type RatingAggregate = { average: number | null; count: number };

/**
 * Average + count of the ratings *received* by each of `rateeUserIds`,
 * keyed by user id. Goes through the service role: `ratings` RLS only
 * exposes a user's own rows, but the aggregate is shown on other people's
 * match cards (same reasoning as the contact-details route).
 */
export async function ratingAggregatesByUser(
  rateeUserIds: string[],
): Promise<Map<string, RatingAggregate>> {
  const out = new Map<string, RatingAggregate>();
  const ids = [...new Set(rateeUserIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const admin = createAdminClient();
  const { data } = await admin.from("ratings").select("ratee_user_id, score").in("ratee_user_id", ids);

  const totals = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
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
 * Every rating a profile has received — aggregate plus the individual
 * reviews, newest first — for the profile-card "see all reviews" view.
 * Service role, since `ratings` RLS only exposes the caller's own rows.
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

  const { data: rows } = await admin
    .from("ratings")
    .select("score, comment, created_at")
    .eq("ratee_user_id", profile.user_id)
    .order("created_at", { ascending: false });

  const reviews: ProfileReview[] = (rows ?? []).map((r) => ({
    score: r.score,
    comment: r.comment,
    createdAt: r.created_at,
  }));
  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.score, 0) / count) * 10) / 10
    : null;

  return { average, count, reviews };
}
