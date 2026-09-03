import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

// Hard-delete a user: removes the auth.users row, which cascades to
// public.users and everything under it (profiles, matches, messages,
// ratings, notifications, subscription grants). `reports` reference
// users without ON DELETE, so those rows are cleared first.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (id === admin.userId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const db = createAdminClient();

  await db.from("reports").delete().or(`reporter_user_id.eq.${id},reported_user_id.eq.${id}`);
  await db.from("reports").update({ resolved_by_admin_id: null }).eq("resolved_by_admin_id", id);

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "deleted" });
}
