import { NextResponse } from "next/server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { containsContactInfo } from "@/lib/content-filter";
import { resolvePostAuthors, decoratePosts, POST_FEED_COLUMNS } from "@/lib/posts";
import { reportMetaEvent } from "@/lib/meta-capi";

const PAGE_SIZE = 20;
const PROFILE_REQUIRED = "Create a profile before posting, so people can see who they're talking to.";

const createSchema = z.object({
  caption: z.string().trim().min(1).max(500),
  kind: z.enum(["looking_for", "offering"]),
  // Which of the caller's profiles the post shows as. Required: people
  // without a profile can't post (they showed up as "Someone"). Kept
  // nullable in the schema so an old client gets the clear "create a
  // profile" error below rather than a validation dump. See
  // src/lib/post-identities.ts for how the client learns what's eligible.
  postedAs: z.object({ profileId: z.string().uuid() }).nullable().optional(),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before"); // created_at cursor for "load more"
  const mine = searchParams.get("mine") === "1";

  let query = supabase
    .from("posts")
    .select(POST_FEED_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  // The public feed only ever shows open posts; "my posts" (profile page)
  // shows the caller's own full history, closed ones included, so they can
  // still see and delete something they closed earlier.
  query = mine ? query.eq("user_id", user.id) : query.eq("status", "open");

  if (before) query = query.lt("created_at", before);

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const decorated = await decoratePosts(posts ?? [], user.id, supabase);
  // Older posts from accounts with no profile at all (they showed as
  // "Someone") stay out of the public feed; their author still sees them
  // under "my posts".
  const results = mine ? decorated : decorated.filter((p) => p.author);
  const last = posts?.[posts.length - 1];

  return NextResponse.json({ posts: results, nextCursor: posts?.length === PAGE_SIZE && last ? last.created_at : null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (containsContactInfo(parsed.data.caption)) {
    return NextResponse.json(
      { error: "Please remove phone numbers, emails, or social handles from your post. Contact details are only shared once you match." },
      { status: 400 },
    );
  }

  if (!parsed.data.postedAs) {
    return NextResponse.json({ error: PROFILE_REQUIRED, code: "profile_required" }, { status: 403 });
  }

  const insertPayload: TablesInsert<"posts"> = {
    user_id: user.id,
    kind: parsed.data.kind,
    caption: parsed.data.caption,
  };

  {
    const { profileId } = parsed.data.postedAs;
    // Re-verified here (not just left to RLS) so a bad postedAs value gets
    // a clean 400 instead of a raw permission-denied error -- RLS
    // (posts_insert) is still the real backstop against a forged request.
    const { data: owned } = await supabase
      .from("generic_profiles")
      .select("id")
      .eq("id", profileId)
      .eq("user_id", user.id)
      .neq("status", "draft")
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Invalid postedAs identity" }, { status: 400 });
    }
    insertPayload.posted_as_generic_profile_id = profileId;
  }

  const { data: post, error } = await supabase
    .from("posts")
    .insert(insertPayload)
    .select("id, user_id, kind, caption, created_at, posted_as_generic_profile_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await reportMetaEvent("CreatePost", { user: { id: user.id, email: user.email, phone: user.phone }, params: { content_type: post.kind } });

  return NextResponse.json(
    { post: { ...post, author: (await resolvePostAuthors([post])).get(post.id) ?? null, likeCount: 0, likedByMe: false, replyCount: 0, featured: false, isMine: true } },
    { status: 201 },
  );
}
