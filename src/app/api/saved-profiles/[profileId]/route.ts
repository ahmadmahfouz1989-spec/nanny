import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";

/**
 * Explicit save/remove rather than a toggle -- retrying either one
 * produces the same outcome instead of accidentally reversing it. The
 * insert/delete run through the request-scoped client so RLS
 * (favorites_insert_own / favorites_delete_own) is the actual enforcement
 * point: self-save, "can't save what you can't view", and suspended
 * accounts are all rejected at the database layer, not re-implemented
 * here (see supabase/migrations/20260923000001_saved_profiles.sql).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The favorite's own id/created_at are returned so a client restoring a
  // removed item (Saved page Undo) can reconcile it with the row that now
  // actually exists, rather than reusing the deleted row's identity.
  const { data: inserted, error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, generic_profile_id: profileId })
    .select("id, created_at")
    .single();

  if (error) {
    // Already saved -- the partial unique index rejected the duplicate.
    // Idempotent by design: this is success, not a conflict to surface.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("favorites")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("generic_profile_id", profileId)
        .maybeSingle();
      return NextResponse.json({ status: "saved", favorite: existing ?? null });
    }
    return NextResponse.json({ error: "Cannot save this profile" }, { status: 403 });
  }

  return NextResponse.json({ status: "saved", favorite: inserted }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Idempotent by nature -- deleting zero matching rows is still success --
  // but a genuine DB/network failure must not be reported as one, or the
  // client's optimistic removal never gets rolled back.
  const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("generic_profile_id", profileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "removed" });
}
