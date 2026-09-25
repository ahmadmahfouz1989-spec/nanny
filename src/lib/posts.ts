import { createAdminClient } from "@/lib/supabase/admin";
import { featuredUserIds } from "@/lib/featured";
import type { createClient } from "@/lib/supabase/server";

// `profileId` names the profile ProfileSummaryPanel should open for this
// author. An author with no profile anywhere just shows a name with no
// clickable summary.
export type PostAuthor = {
  fullName: string;
  profileId: string | null;
  photoUrl: string | null;
};

/**
 * A user's default display identity, independent of any specific post --
 * used for reply authors and "who liked/replied" notification-email
 * lookups, neither of which have (or need) a real post row to key off of.
 * Their oldest profile's name and photo. Service role: this should always
 * resolve a name regardless of a profile's own moderation/pause state,
 * same reasoning as the ratings and featured-status lookups.
 */
export async function defaultIdentityByUser(posts: { user_id: string }[]): Promise<Map<string, PostAuthor>> {
  const userIds = [...new Set(posts.map((p) => p.user_id))];
  const out = new Map<string, PostAuthor>();
  if (userIds.length === 0) return out;

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("generic_profiles")
    .select("id, user_id, full_name, profile_photo_url")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });

  for (const g of profiles ?? []) {
    if (!out.has(g.user_id)) out.set(g.user_id, { fullName: g.full_name, profileId: g.id, photoUrl: g.profile_photo_url });
  }
  return out;
}

type PostWithIdentity = {
  id: string;
  user_id: string;
  posted_as_generic_profile_id: string | null;
};

/**
 * Which identity each specific post was actually published under, keyed
 * by post id (not user id) -- unlike defaultIdentityByUser, two posts from
 * the same account can show two different identities here, since the
 * poster chooses one per post. Posts with no chosen identity (older rows,
 * plus any post from an account with no eligible profile at the time)
 * fall back to defaultIdentityByUser.
 */
export async function resolvePostAuthors(posts: PostWithIdentity[]): Promise<Map<string, PostAuthor>> {
  const out = new Map<string, PostAuthor>();
  if (posts.length === 0) return out;

  const chosenIds = [...new Set(posts.map((p) => p.posted_as_generic_profile_id).filter((id): id is string => !!id))];
  const admin = createAdminClient();
  const { data: profiles } = chosenIds.length
    ? await admin.from("generic_profiles").select("id, full_name, profile_photo_url").in("id", chosenIds)
    : { data: [] as { id: string; full_name: string; profile_photo_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((g) => [g.id, g]));

  // Includes posts whose chosen profile wasn't found (e.g. deleted
  // concurrently, on delete set null racing this read) -- resolved like a
  // post with no chosen identity rather than left with no author at all.
  const needsDefault: PostWithIdentity[] = [];
  for (const post of posts) {
    const g = post.posted_as_generic_profile_id ? profileById.get(post.posted_as_generic_profile_id) : undefined;
    if (g) out.set(post.id, { fullName: g.full_name, profileId: g.id, photoUrl: g.profile_photo_url });
    else needsDefault.push(post);
  }

  if (needsDefault.length > 0) {
    const byUser = await defaultIdentityByUser(needsDefault);
    for (const post of needsDefault) {
      const author = byUser.get(post.user_id);
      if (author) out.set(post.id, author);
    }
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

export const POST_FEED_COLUMNS = "id, user_id, kind, caption, status, created_at, posted_as_generic_profile_id";

/**
 * Everything the feed renders per post beyond its own row -- author,
 * engagement counts, featured badge, ownership. Shared by the paginated
 * feed and the single-post lookup a notification deep link uses, so a
 * post opened from either looks identical.
 */
type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Which of these authors' profiles the *viewer* may actually open.
 * Authors are resolved with the service role (a name should always show),
 * but the profile preview reads through the viewer's own session, where
 * RLS decides. Asking the same RLS here keeps the feed from offering a
 * profile button that can only end in "Profile not found".
 */
async function viewableAuthorProfiles(supabase: SessionClient, authors: PostAuthor[]): Promise<Set<string>> {
  const ids = [...new Set(authors.map((a) => a.profileId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Set();
  const { data } = await supabase.from("generic_profiles").select("id").in("id", ids);
  return new Set((data ?? []).map((row) => row.id));
}

export async function decoratePosts<T extends PostWithIdentity>(posts: T[], userId: string, supabase: SessionClient) {
  const [authors, engagement, featured] = await Promise.all([
    resolvePostAuthors(posts),
    postEngagement(posts.map((p) => p.id), userId),
    featuredUserIds(posts.map((p) => p.user_id)),
  ]);
  const viewable = await viewableAuthorProfiles(supabase, [...authors.values()]);

  return posts.map((p) => {
    const author = authors.get(p.id) ?? null;
    // Keep the name/photo, but drop the profile link the viewer can't open.
    const canOpen = !!author?.profileId && viewable.has(author.profileId);
    return {
      ...p,
      author: author && !canOpen ? { ...author, profileId: null } : author,
      ...(engagement.get(p.id) ?? { likeCount: 0, likedByMe: false, replyCount: 0 }),
      featured: featured.has(p.user_id),
      isMine: p.user_id === userId,
    };
  });
}
