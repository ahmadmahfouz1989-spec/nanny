import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removePostPhotos } from "@/lib/post-photos";
import { requireAdmin } from "@/lib/admin/auth";

// Moderation delete of any feed post. Service role, since posts_delete only
// lets an author delete their own. Its replies and likes cascade with it;
// a report that pointed at it keeps its row (reports.post_id is ON DELETE
// SET NULL).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: removed, error } = await db.from("posts").delete().eq("id", id).select("user_id, photo_urls");
  const count = removed?.length ?? 0;
  if (removed?.[0]) await removePostPhotos(db, removed[0].user_id, removed[0].photo_urls);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
