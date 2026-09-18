import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { recomputeMatchesForParent, recomputeMatchesForNanny } from "@/lib/matching/recompute";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

const bodySchema = z.object({
  profileType: z.enum(["parent", "nanny", "generic"]),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { profileType, status, notes } = parsed.data;

  const db = createAdminClient();
  const table = profileType === "parent" ? "parent_profiles" : profileType === "nanny" ? "nanny_profiles" : "generic_profiles";
  // Only generic_profiles carries a category, needed to deep-link the
  // notification to the right dashboard (nanny's is a fixed route).
  const selectCols = profileType === "generic" ? "id, user_id, full_name, categories(slug)" : "id, user_id, full_name";

  if (status === "rejected") {
    // A rejection isn't a state to leave someone in -- delete the
    // submission outright (cascades take the row's matches/messages/etc.
    // with it) so the user lands back at "no profile yet" and can
    // resubmit from a clean slate instead of editing a rejected draft.
    const { data: deleted, error } = await db.from(table).delete().eq("id", id).select(selectCols).single();

    if (error || !deleted) {
      return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
    }

    const row = deleted as unknown as { user_id: string; categories?: { slug: string } | null };

    await db.from("notifications").insert({
      user_id: row.user_id,
      type: "profile_rejected",
      payload: { profile_type: profileType, notes: notes ?? null, category_slug: row.categories?.slug ?? null },
    });

    return NextResponse.json({ profile: deleted });
  }

  const { data: updated, error } = await db.from(table).update({ moderation_status: status }).eq("id", id).select(selectCols).single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
  }

  const row = updated as unknown as { user_id: string; categories?: { slug: string } | null };

  await db.from("notifications").insert({
    user_id: row.user_id,
    type: "profile_approved",
    payload: { profile_type: profileType, category_slug: row.categories?.slug ?? null },
  });

  // Approval makes this profile visible to counterparts for the first time —
  // recompute now so it's matched against everyone already approved on the
  // other side (spec appendix: this was the known gap left after R4/R5).
  if (profileType === "parent") {
    await recomputeMatchesForParent(id);
  } else if (profileType === "nanny") {
    await recomputeMatchesForNanny(id);
  } else {
    await recomputeGenericMatchesForProfile(id);
  }

  return NextResponse.json({ profile: updated });
}
