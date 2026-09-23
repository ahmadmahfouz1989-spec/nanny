import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { verifyMatchParticipants } from "@/lib/reports";

const bodySchema = z.object({
  reportedProfileId: z.string().uuid().optional(),
  profileType: z.enum(["parent", "nanny", "generic"]).optional(),
  reportedPostId: z.string().uuid().optional(),
  reason: z.enum(["inappropriate_content", "harassment", "fraud_scam", "fake_profile", "other"]),
  details: z.string().max(1000).optional(),
  // Which specific conversation this report is about, when the report was
  // filed from within one -- lets admin review show that exact
  // conversation instead of guessing at one via a mutual-match search,
  // which is ambiguous once the same two people share more than one
  // active service relationship (e.g. both a nanny match and a nursing
  // match). "nanny" for the legacy matches table, a category slug for a
  // generic_matches row (mirrors InboxConversation.source).
  matchId: z.string().uuid().optional(),
  matchSource: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let reportedUserId: string;
  let postId: string | null = null;

  if (parsed.data.reportedPostId) {
    const { data: post } = await supabase.from("posts").select("user_id").eq("id", parsed.data.reportedPostId).maybeSingle();
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    reportedUserId = post.user_id;
    postId = parsed.data.reportedPostId;
  } else if (parsed.data.reportedProfileId && parsed.data.profileType) {
    const table =
      parsed.data.profileType === "parent"
        ? "parent_profiles"
        : parsed.data.profileType === "nanny"
          ? "nanny_profiles"
          : "generic_profiles";
    const { data: profile } = await supabase.from(table).select("user_id").eq("id", parsed.data.reportedProfileId).maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    reportedUserId = profile.user_id;
  } else {
    return NextResponse.json({ error: "Either reportedPostId or reportedProfileId + profileType is required" }, { status: 400 });
  }

  if (reportedUserId === user.id) {
    return NextResponse.json({ error: "You cannot report yourself" }, { status: 400 });
  }

  // Only attach the match if it actually involves these exact two users --
  // otherwise a fabricated matchId could point admin review at an
  // unrelated conversation. Silently drop it rather than failing the
  // whole report; the admin endpoint falls back to its own lookup when
  // match_id is null.
  const verifiedMatch =
    parsed.data.matchId && parsed.data.matchSource
      ? await verifyMatchParticipants(supabase, parsed.data.matchSource, parsed.data.matchId, user.id, reportedUserId)
      : false;

  const { error } = await supabase.from("reports").insert({
    reporter_user_id: user.id,
    reported_user_id: reportedUserId,
    post_id: postId,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
    match_id: verifiedMatch ? parsed.data.matchId : null,
    match_source: verifiedMatch ? parsed.data.matchSource : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "reported" }, { status: 201 });
}
