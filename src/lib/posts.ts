import { createAdminClient } from "@/lib/supabase/admin";

// `role` (and a usable `profileId`) is only present for a parent/nanny
// author -- that's what ProfileSummaryPanel knows how to render. A post's
// author might instead be a nursing (or other category) account, or have
// no profile anywhere yet; those just show a name with no clickable
// summary, same as the existing "someone" fallback for no author at all.
export type PostAuthor = { fullName: string; role?: "parent" | "nanny"; profileId: string | null; photoUrl: string | null };

/**
 * Display name for each post's author. The feed is open to any account
 * regardless of category, so this resolves by user id, not by (the now
 * role-agnostic) post.kind: parent/nanny accounts show their profile
 * name+photo, anyone else falls back to their generic_profiles full_name
 * (arbitrary category, if they have more than one) with no photo. Service
 * role: a post's author should always show a name regardless of a
 * profile's own moderation/pause state, same reasoning as the ratings and
 * featured-status lookups.
 */
export async function postAuthors(posts: { user_id: string }[]): Promise<Map<string, PostAuthor>> {
  const userIds = [...new Set(posts.map((p) => p.user_id))];
  const out = new Map<string, PostAuthor>();
  if (userIds.length === 0) return out;

  const admin = createAdminClient();
  const { data: userRows } = await admin.from("users").select("id, role").in("id", userIds);
  const parentIds = (userRows ?? []).filter((u) => u.role === "parent").map((u) => u.id);
  const nannyIds = (userRows ?? []).filter((u) => u.role === "nanny").map((u) => u.id);
  const otherIds = userIds.filter((id) => !parentIds.includes(id) && !nannyIds.includes(id));

  const [{ data: parents }, { data: nannies }, { data: generics }] = await Promise.all([
    parentIds.length
      ? admin.from("parent_profiles").select("id, user_id, full_name, profile_photo_url").in("user_id", parentIds)
      : Promise.resolve({ data: [] as { id: string; user_id: string; full_name: string; profile_photo_url: string | null }[] }),
    nannyIds.length
      ? admin.from("nanny_profiles").select("id, user_id, full_name, profile_photo_url").in("user_id", nannyIds)
      : Promise.resolve({ data: [] as { id: string; user_id: string; full_name: string; profile_photo_url: string | null }[] }),
    otherIds.length
      ? admin.from("generic_profiles").select("user_id, full_name").in("user_id", otherIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
  ]);

  for (const p of parents ?? [])
    out.set(p.user_id, { fullName: p.full_name, role: "parent", profileId: p.id, photoUrl: p.profile_photo_url });
  for (const n of nannies ?? [])
    out.set(n.user_id, { fullName: n.full_name, role: "nanny", profileId: n.id, photoUrl: n.profile_photo_url });
  for (const g of generics ?? []) {
    if (!out.has(g.user_id)) out.set(g.user_id, { fullName: g.full_name, profileId: null, photoUrl: null });
  }
  return out;
}

export type PostEngagement = { likeCount: number; likedByMe: boolean; replyCount: number };

/** Like/reply counts for a page of posts, plus which ones the caller has liked. */
export async function postEngagement(postIds: string[], userId: string): Promise<Map<string, PostEngagement>> {
  const out = new Map<string, PostEngagement>();
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, { likeCount: 0, likedByMe: false, replyCount: 0 });

  const admin = createAdminClient();
  const [{ data: likes }, { data: replies }] = await Promise.all([
    admin.from("post_likes").select("post_id, user_id").in("post_id", ids),
    admin.from("post_replies").select("post_id").in("post_id", ids),
  ]);

  for (const like of likes ?? []) {
    const agg = out.get(like.post_id);
    if (!agg) continue;
    agg.likeCount += 1;
    if (like.user_id === userId) agg.likedByMe = true;
  }
  for (const reply of replies ?? []) {
    const agg = out.get(reply.post_id);
    if (agg) agg.replyCount += 1;
  }
  return out;
}
