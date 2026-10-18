import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { notifyAdminsOfPendingReview } from "@/lib/admin/pending-review";

const bodySchema = z.object({
  profileId: z.uuid(),
  headline: z.string().trim().max(80),
});

/**
 * Sets (or, empty, clears) the one-line headline under the name on the
 * caller's profile page. Like any other profile edit it goes back to
 * review (see /api/generic-profile) -- a headline is public text.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { profileId, headline } = parsed.data;

  const db = createAdminClient();
  const { data: profile } = await db
    .from("generic_profiles")
    .select("id, role, full_name, status, headline, categories(slug, name_en, name_ar)")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || profile.status === "draft") {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const next = headline || null;
  if (next === profile.headline) {
    return NextResponse.json({ ok: true, headline: next });
  }

  // Clearing it shows nothing new, so only a new headline needs review.
  const { error } = await db
    .from("generic_profiles")
    .update(next ? { headline: next, moderation_status: "pending" } : { headline: null })
    .eq("id", profileId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (next && profile.categories) {
    const role = profile.role as "seeker" | "provider";
    await notifyAdminsOfPendingReview(profile.full_name, `${profile.categories.slug}_${role}`, profile.categories, role);
  }
  return NextResponse.json({ ok: true, headline: next, moderationStatus: next ? "pending" : undefined });
}
