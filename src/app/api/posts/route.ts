import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { containsContactInfo } from "@/lib/content-filter";
import { postAuthors, postEngagement } from "@/lib/posts";
import { featuredUserIds } from "@/lib/featured";

const PAGE_SIZE = 20;

const createSchema = z.object({
  caption: z.string().trim().min(1).max(500),
  kind: z.enum(["looking_for", "offering"]),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before"); // created_at cursor for "load more"
  const mine = searchParams.get("mine") === "1";

  let query = supabase
    .from("posts")
    .select("id, user_id, kind, caption, status, created_at")
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

  const [authors, engagement, featured] = await Promise.all([
    postAuthors(posts ?? []),
    postEngagement((posts ?? []).map((p) => p.id) as string[], user.id),
    featuredUserIds((posts ?? []).map((p) => p.user_id as string)),
  ]);

  const results = (posts ?? []).map((p) => ({
    ...p,
    author: authors.get(p.user_id as string) ?? null,
    ...(engagement.get(p.id as string) ?? { likeCount: 0, likedByMe: false, replyCount: 0 }),
    featured: featured.has(p.user_id as string),
    isMine: p.user_id === user.id,
  }));

  return NextResponse.json({ posts: results, nextCursor: results.length === PAGE_SIZE ? results[results.length - 1].created_at : null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: post, error } = await supabase
    .from("posts")
    .insert({ user_id: user.id, kind: parsed.data.kind, caption: parsed.data.caption })
    .select("id, user_id, kind, caption, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { post: { ...post, author: (await postAuthors([post])).get(user.id) ?? null, likeCount: 0, likedByMe: false, replyCount: 0, featured: false, isMine: true } },
    { status: 201 },
  );
}
