import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { decoratePosts, POST_FEED_COLUMNS } from "@/lib/posts";

// A single post, in the same shape as a GET /api/posts entry -- lets a
// notification deep link (/feed?post=...) show its post even when it's
// far past the feed's first page. RLS (posts_select) limits this to open
// posts plus the caller's own.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: post, error } = await supabase.from("posts").select(POST_FEED_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [decorated] = await decoratePosts([post], user.id);
  return NextResponse.json({ post: decorated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error, count } = await supabase.from("posts").delete({ count: "exact" }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
