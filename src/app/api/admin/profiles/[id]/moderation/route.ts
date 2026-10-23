import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { ownProfilePhotoObject } from "@/lib/storage-cleanup";
import { notify } from "@/lib/push";
import { WORK_BUCKET, workPhotoPaths } from "@/lib/work";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Whether this profile has a real conversation behind it (a match with at
 * least one message, see generic_matches.last_message_at), not just
 * scored matches nobody has written in.
 */
async function hasConversation(db: Admin, profileId: string) {
  const [{ count: asSeeker }, { count: asProvider }] = await Promise.all([
    db.from("generic_matches").select("id", { count: "exact", head: true }).eq("seeker_profile_id", profileId).not("last_message_at", "is", null),
    db.from("generic_matches").select("id", { count: "exact", head: true }).eq("provider_profile_id", profileId).not("last_message_at", "is", null),
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
  const { status, notes } = parsed.data;

  const db = createAdminClient();
  // Selected columns include the category, which deep-links the
  // notification to the right dashboard.

  if (status === "rejected") {
    // A submission nobody ever messaged with has nothing to
    // protect -- delete it outright (cascades take its matches/messages
    // with it, but there's no conversation to lose) so the user lands
    // back at "no profile yet" and can resubmit from a clean slate.
    //
    // A profile WITH conversations might be a resubmission of an edit to
    // an already-thriving profile (any save, including a plain photo
    // change, resets moderation_status to pending -- see
    // /api/generic-profile) -- deleting that would take real
    // conversations and message history down with it. Reject it the old
    // way instead: flip the status, leave everything else intact. The
    // profile just goes invisible to new matching (RLS requires
    // status=active + moderation_status=approved for anyone else to see
    // it) without touching what already exists.
    if (await hasConversation(db, id)) {
      const { data: updated, error } = await db
        .from("generic_profiles")
        .update({ moderation_status: "rejected" })
        .eq("id", id)
        .select("id, user_id, full_name, categories(slug)")
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
      }

      const row = updated;

      // A rejected delivery provider's ID isn't accepted either; a new
      // upload goes back to review.
      await db.from("id_documents").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("profile_id", id);

      await notify({
        user_id: row.user_id,
        type: "profile_rejected",
        payload: { profile_type: "generic", notes: notes ?? null, category_slug: row.categories?.slug ?? null },
      });

      return NextResponse.json({ profile: updated, deleted: false });
    }

    // Work photo files don't go with the cascade -- note them first.
    const { data: work } = await db.from("work_projects").select("id, user_id").eq("profile_id", id);
    const workPaths = work?.length ? await workPhotoPaths(db, work.map((w) => w.id), work[0].user_id) : [];
    // Nor does the ID document's file (its row goes with the profile).
    const { data: idDoc } = await db.from("id_documents").select("path").eq("profile_id", id).maybeSingle();

    const { data: deleted, error } = await db.from("generic_profiles").delete().eq("id", id).select("id, user_id, full_name, categories(slug), profile_photo_url").single();

    if (error || !deleted) {
      return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
    }

    const row = deleted;

    if (workPaths.length) await db.storage.from(WORK_BUCKET).remove(workPaths).catch(() => {});
    if (idDoc?.path) await db.storage.from("id-documents").remove([idDoc.path]).catch(() => {});

    if (row.profile_photo_url) {
      // Only ever delete a path under this profile's own owner folder, in
      // whichever photo bucket it lives. Best-effort: a storage hiccup here
      // shouldn't fail a moderation decision that already succeeded.
      const photo = ownProfilePhotoObject(row.profile_photo_url, row.user_id);
      if (photo) await db.storage.from(photo.bucket).remove([photo.path]).catch(() => {});
    }

    await notify({
      user_id: row.user_id,
      type: "profile_rejected",
      payload: { profile_type: "generic", notes: notes ?? null, category_slug: row.categories?.slug ?? null },
    });

    return NextResponse.json({ profile: deleted, deleted: true });
  }

  const { data: updated, error } = await db.from("generic_profiles").update({ moderation_status: status }).eq("id", id).select("id, user_id, full_name, categories(slug)").single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Profile not found" }, { status: 404 });
  }

  const row = updated;

  // Approving a delivery provider is approving the ID they uploaded with it
  // -- that's what the reviewer looked at. Shows as "ID checked".
  await db.from("id_documents").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("profile_id", id);

  await notify({
    user_id: row.user_id,
    type: "profile_approved",
    payload: { profile_type: "generic", category_slug: row.categories?.slug ?? null },
  });

  // Approval makes this profile visible to counterparts for the first time —
  // recompute now so it's matched against everyone already approved on the
  // other side (spec appendix: this was the known gap left after R4/R5).
  await recomputeGenericMatchesForProfile(id);

  return NextResponse.json({ profile: updated });
}
