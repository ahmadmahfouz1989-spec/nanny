import { createAdminClient } from "@/lib/supabase/admin";

export type PostAuthor = { fullName: string; role: "parent" | "nanny" };

/**
 * Display name for each post's author, resolved from the role-appropriate
 * profile table. Service role: a viewer's own `parent_profiles`/
 * `nanny_profiles` RLS only exposes profiles from their own side plus
 * approved+active ones from the other side, but a post's author should
 * always show a name regardless of moderation/pause state, same reasoning
 * as the ratings and featured-status lookups.
 */
export async function postAuthors(
  posts: { user_id: string; kind: "looking_for" | "offering" }[],
): Promise<Map<string, PostAuthor>> {
  const out = new Map<string, PostAuthor>();
  const parentUserIds = [...new Set(posts.filter((p) => p.kind === "looking_for").map((p) => p.user_id))];
  const nannyUserIds = [...new Set(posts.filter((p) => p.kind === "offering").map((p) => p.user_id))];
  if (parentUserIds.length === 0 && nannyUserIds.length === 0) return out;

  const admin = createAdminClient();
  const [{ data: parents }, { data: nannies }] = await Promise.all([
    parentUserIds.length
      ? admin.from("parent_profiles").select("user_id, full_name").in("user_id", parentUserIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
    nannyUserIds.length
      ? admin.from("nanny_profiles").select("user_id, full_name").in("user_id", nannyUserIds)
      : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
  ]);

  for (const p of parents ?? []) out.set(p.user_id, { fullName: p.full_name, role: "parent" });
  for (const n of nannies ?? []) out.set(n.user_id, { fullName: n.full_name, role: "nanny" });
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
