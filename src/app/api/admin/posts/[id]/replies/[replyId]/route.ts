import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

// Moderation delete of any reply (and, via parent_reply_id's cascade,
// everything nested under it). Scoped to the post in the URL so a reply
// id can't be deleted through an unrelated post's route.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; replyId: string }> },
) {
  const { id, replyId } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { error, count } = await createAdminClient()
    .from("post_replies")
    .delete({ count: "exact" })
    .eq("id", replyId)
    .eq("post_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
