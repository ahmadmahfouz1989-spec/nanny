import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { recomputeMatchesForParent, recomputeMatchesForNanny } from "@/lib/matching/recompute";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { storageOwnPathFromPublicUrl } from "@/lib/storage-cleanup";

const bodySchema = z.object({
  profileType: z.enum(["parent", "nanny", "generic"]),
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Messaging only ever unlocks once a match goes mutual (see the
 * generic_messages/messages RLS, which gates on match status, not on the
 * profile's own moderation_status) -- so "has a mutual match" is exactly
 * the signal that this profile might have a real conversation behind it,
 * not just an unrequited score.
 */
async function hasMutualMatch(db: Admin, profileType: "parent" | "nanny" | "generic", profileId: string) {
  if (profileType === "parent") {
    const { count } = await db
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("parent_profile_id", profileId)
      .eq("status", "mutual");
    return (count ?? 0) > 0;
  }
  if (profileType === "nanny") {
    const { count } = await db
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("nanny_profile_id", profileId)
      .eq("status", "mutual");
    return (count ?? 0) > 0;
  }
  const [{ count: asSeeker }, { count: asProvider }] = await Promise.all([
    db.from("generic_matches").select("id", { count: "exact", head: true }).eq("seeker_profile_id", profileId).eq("status", "mutual"),
    db.from("generic_matches").select("id", { count: "exact", head: true }).eq("provider_profile_id", profileId).eq("status", "mutual"),
  ]);
  return (asSeeker ?? 0) > 0 || (asProvider ?? 0) > 0;
}

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
    // A submission that never went mutual with anyone has nothing to
    // protect -- delete it outright (cascades take its matches/messages
    // with it, but there's no conversation to lose) so the user lands
    // back at "no profile yet" and can resubmit from a clean slate.
    //
    // A profile that DID go mutual might be a resubmission of an edit to
    // an already-thriving profile (any save, including a plain photo
    // change, resets moderation_status to pending -- see
    // /api/generic-profile) -- deleting that would take real
    // conversations and message history down with it. Reject it the old
    // way instead: flip the status, leave everything else intact. The
    // profile just goes invisible to new matching (RLS requires
    // status=active + moderation_status=approved for anyone else to see
    // it) without touching what already exists.
    if (await hasMutualMatch(db, profileType, id)) {
      const { data: updated, error } = await db
        .from(table)
        .update({ moderation_status: "rejected" })
        .eq("id", id)
        .select(selectCols)
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
      }

      const row = updated as unknown as { user_id: string; categories?: { slug: string } | null };

      await db.from("notifications").insert({
        user_id: row.user_id,
        type: "profile_rejected",
        payload: { profile_type: profileType, notes: notes ?? null, category_slug: row.categories?.slug ?? null },
      });

      return NextResponse.json({ profile: updated, deleted: false });
    }

    // Every profile table has a photo column -- fetch it so the storage
    // file is cleaned up alongside the DB row.
    const deleteSelectCols = `${selectCols}, profile_photo_url`;

    const { data: deleted, error } = await db.from(table).delete().eq("id", id).select(deleteSelectCols).single();

    if (error || !deleted) {
      return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
    }

    const row = deleted as unknown as {
      user_id: string;
      categories?: { slug: string } | null;
      profile_photo_url?: string | null;
    };

    if (row.profile_photo_url) {
      const bucket = profileType === "parent" ? "parent-photos" : profileType === "nanny" ? "nanny-photos" : "generic-photos";
      // profile_photo_url is client-submitted and only validated as a URL --
      // it could name another account's real photo. Only ever delete a
      // path that actually lives under this profile's own owner folder.
      const path = storageOwnPathFromPublicUrl(row.profile_photo_url, bucket, row.user_id);
      // Best-effort: a storage hiccup here shouldn't fail a moderation
      // decision that already succeeded in the database.
      if (path) await db.storage.from(bucket).remove([path]).catch(() => {});
    }

    await db.from("notifications").insert({
      user_id: row.user_id,
      type: "profile_rejected",
      payload: { profile_type: profileType, notes: notes ?? null, category_slug: row.categories?.slug ?? null },
    });

    return NextResponse.json({ profile: deleted, deleted: true });
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
