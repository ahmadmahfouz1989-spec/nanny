import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";

const FK_COLUMN: Record<string, "parent_profile_id" | "nanny_profile_id" | "generic_profile_id"> = {
  parent: "parent_profile_id",
  nanny: "nanny_profile_id",
  generic: "generic_profile_id",
};

/**
 * Explicit save/remove rather than a toggle -- retrying either one
 * produces the same outcome instead of accidentally reversing it. The
 * insert/delete run through the request-scoped client so RLS
 * (favorites_insert_own / favorites_delete_own) is the actual enforcement
 * point: self-save, "can't save what you can't view", and suspended
 * accounts are all rejected at the database layer, not re-implemented
 * here (see supabase/migrations/20260923000001_saved_profiles.sql).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ type: string; profileId: string }> }) {
  const { type, profileId } = await params;
  const column = FK_COLUMN[type];
  if (!column) {
    return NextResponse.json({ error: "Invalid profile type" }, { status: 400 });
  }

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase.from("favorites").insert({ user_id: user.id, [column]: profileId });

  if (error) {
    // Already saved -- the partial unique index rejected the duplicate.
    // Idempotent by design: this is success, not a conflict to surface.
    if (error.code === "23505") {
      return NextResponse.json({ status: "saved" });
    }
    return NextResponse.json({ error: "Cannot save this profile" }, { status: 403 });
  }

  return NextResponse.json({ status: "saved" }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; profileId: string }> }) {
  const { type, profileId } = await params;
  const column = FK_COLUMN[type];
  if (!column) {
    return NextResponse.json({ error: "Invalid profile type" }, { status: 400 });
  }

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Idempotent by nature -- deleting zero matching rows is still success.
  await supabase.from("favorites").delete().eq("user_id", user.id).eq(column, profileId);

  return NextResponse.json({ status: "removed" });
}
