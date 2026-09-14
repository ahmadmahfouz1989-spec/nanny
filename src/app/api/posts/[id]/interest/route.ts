import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMatchAccess } from "@/lib/matching/access";
import { applyInterest } from "@/lib/matching/apply-interest";

/**
 * "I'm interested" on a feed post is just another front door into the
 * matches table -- the recompute job already upserts a match row for every
 * active+approved parent x nanny pair, so this only has to find the id and
 * hand off to the exact same transition matches/[id]/interest uses.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: post } = await supabase.from("posts").select("id, user_id, kind").eq("id", id).maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.user_id === user.id) {
    return NextResponse.json({ error: "You can't express interest in your own post" }, { status: 400 });
  }

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  const expectedViewerRole = post.kind === "looking_for" ? "nanny" : "parent";
  if (me?.role !== expectedViewerRole) {
    return NextResponse.json(
      { error: post.kind === "looking_for" ? "Only nannies can respond to this post" : "Only parents can respond to this post" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const authorTable = post.kind === "looking_for" ? "parent_profiles" : "nanny_profiles";
  const myTable = post.kind === "looking_for" ? "nanny_profiles" : "parent_profiles";

  const [{ data: authorProfile }, { data: myProfile }] = await Promise.all([
    admin.from(authorTable).select("id").eq("user_id", post.user_id).maybeSingle(),
    admin.from(myTable).select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!authorProfile || !myProfile) {
    return NextResponse.json({ error: "Complete your profile before connecting" }, { status: 400 });
  }

  const parentProfileId = post.kind === "looking_for" ? authorProfile.id : myProfile.id;
  const nannyProfileId = post.kind === "looking_for" ? myProfile.id : authorProfile.id;

  const { data: match } = await admin
    .from("matches")
    .select("id")
    .eq("parent_profile_id", parentProfileId)
    .eq("nanny_profile_id", nannyProfileId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json(
      { error: "Your match isn't ready yet — make sure your profile is active and try again shortly" },
      { status: 404 },
    );
  }

  const access = await resolveMatchAccess(supabase, match.id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return applyInterest(request, access);
}
