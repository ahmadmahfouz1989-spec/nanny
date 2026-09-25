import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { containsContactInfo } from "@/lib/content-filter";
import { resolvePostAuthors, decoratePosts, POST_FEED_COLUMNS } from "@/lib/posts";

const PAGE_SIZE = 20;

const POST_IDENTITY_COLUMN = {
  parent: "posted_as_parent_profile_id",
  nanny: "posted_as_nanny_profile_id",
  generic: "posted_as_generic_profile_id",
} as const;

const POST_IDENTITY_TABLE = {
  parent: "parent_profiles",
  nanny: "nanny_profiles",
  generic: "generic_profiles",
} as const;

const createSchema = z.object({
  caption: z.string().trim().min(1).max(500),
  kind: z.enum(["looking_for", "offering"]),
  // Omitted or null always means "no chosen identity" (the legacy
  // display path) -- the server never guesses one on the caller's behalf.
  // See src/lib/post-identities.ts for how the client learns what's
  // eligible and which one to default to.
  postedAs: z.object({ type: z.enum(["parent", "nanny", "generic"]), profileId: z.string().uuid() }).nullable().optional(),
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

  const results = await decoratePosts(posts ?? [], user.id);

  return NextResponse.json({ posts: results, nextCursor: results.length === PAGE_SIZE ? results[results.length - 1].created_at : null });
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

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    kind: parsed.data.kind,
    caption: parsed.data.caption,
  };

  if (parsed.data.postedAs) {
    const { type, profileId } = parsed.data.postedAs;
    // Re-verified here (not just left to RLS) so a bad postedAs value gets
    // a clean 400 instead of a raw permission-denied error -- RLS
    // (posts_insert) is still the real backstop against a forged request.
    const { data: owned } = await supabase
      .from(POST_IDENTITY_TABLE[type])
      .select("id")
      .eq("id", profileId)
      .eq("user_id", user.id)
      .neq("status", "draft")
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Invalid postedAs identity" }, { status: 400 });
    }
    insertPayload[POST_IDENTITY_COLUMN[type]] = profileId;
  }

  const { data: post, error } = await supabase
    .from("posts")
    .insert(insertPayload)
    .select("id, user_id, kind, caption, created_at, posted_as_parent_profile_id, posted_as_nanny_profile_id, posted_as_generic_profile_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { post: { ...post, author: (await resolvePostAuthors([post])).get(post.id) ?? null, likeCount: 0, likedByMe: false, replyCount: 0, featured: false, isMine: true } },
    { status: 201 },
  );
}
