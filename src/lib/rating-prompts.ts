import { createAdminClient } from "@/lib/supabase/admin";
import { getCategories } from "@/lib/categories";
import { hiddenUserIds } from "@/lib/hidden-accounts";

/** How long after a conversation starts before asking how it went. */
export const ASK_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export type PendingRating = {
  matchId: string;
  name: string;
  photoUrl: string | null;
  categoryName: string;
};

/**
 * Providers this customer could rate and hasn't: a conversation where both
 * wrote, started at least two days ago, or a completed order between them.
 * Customers rating providers is what fills the ratings people browse by.
 * Newest first, a few at most.
 */
export async function pendingRatings(userId: string, locale: string, limit = 3): Promise<PendingRating[]> {
  const db = createAdminClient();
  const { data: mine } = await db.from("generic_profiles").select("id").eq("user_id", userId).eq("role", "seeker");
  const seekerIds = new Set((mine ?? []).map((p) => p.id));
  if (seekerIds.size === 0) return [];

  const [{ data: sent }, { data: orders }] = await Promise.all([
    db.from("generic_messages").select("match_id, created_at").eq("sender_id", userId).order("created_at", { ascending: true }).limit(1000),
    db.from("errand_orders").select("generic_match_id").eq("seeker_user_id", userId).eq("status", "completed").not("generic_match_id", "is", null),
  ]);

  // When this customer first wrote in each conversation.
  const firstWrote = new Map<string, number>();
  for (const m of sent ?? []) if (!firstWrote.has(m.match_id)) firstWrote.set(m.match_id, Date.parse(m.created_at));
  const ordered = new Set((orders ?? []).map((o) => o.generic_match_id as string));
  const candidates = [...new Set([...firstWrote.keys(), ...ordered])];
  if (candidates.length === 0) return [];

  const [{ data: matches }, { data: replies }, { data: rated }] = await Promise.all([
    db.from("generic_matches").select("id, seeker_profile_id, provider_profile_id").in("id", candidates),
    db.from("generic_messages").select("match_id").in("match_id", candidates).neq("sender_id", userId),
    db.from("generic_ratings").select("match_id").eq("rater_user_id", userId).in("match_id", candidates),
  ]);
  const answered = new Set((replies ?? []).map((r) => r.match_id));
  const done = new Set((rated ?? []).map((r) => r.match_id));
  const now = Date.now();

  const due = (matches ?? []).filter((m) => {
    if (!seekerIds.has(m.seeker_profile_id) || done.has(m.id)) return false;
    if (ordered.has(m.id)) return true;
    const since = firstWrote.get(m.id);
    return answered.has(m.id) && since !== undefined && now - since >= ASK_AFTER_MS;
  });
  if (due.length === 0) return [];

  const [{ data: providers }, categories, hidden] = await Promise.all([
    db.from("generic_profiles").select("id, user_id, full_name, profile_photo_url, category_id").in("id", due.map((m) => m.provider_profile_id)),
    getCategories(),
    hiddenUserIds(),
  ]);
  const byId = new Map((providers ?? []).map((p) => [p.id, p]));
  const category = new Map(categories.map((c) => [c.id, locale === "ar" ? c.name_ar : c.name_en]));
  const skip = new Set([userId, ...hidden]);

  return due
    .map((m) => ({ m, p: byId.get(m.provider_profile_id) }))
    .filter((x): x is { m: (typeof due)[number]; p: NonNullable<typeof x.p> } => !!x.p && !skip.has(x.p.user_id))
    .sort((a, b) => (firstWrote.get(b.m.id) ?? now) - (firstWrote.get(a.m.id) ?? now))
    .slice(0, limit)
    .map(({ m, p }) => ({
      matchId: m.id,
      name: p.full_name,
      photoUrl: p.profile_photo_url,
      categoryName: category.get(p.category_id) ?? "",
    }));
}
