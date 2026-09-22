import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";

// RLS (post_replies_delete: user_id = auth.uid()) already confines this to
// the caller's own reply. Deleting a reply that has its own nested replies
// cascades at the database level (parent_reply_id references ... on delete
// cascade) -- no app-side cleanup needed for the sub-thread underneath it.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; replyId: string }> }) {
  const { replyId } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error, count } = await supabase.from("post_replies").delete({ count: "exact" }).eq("id", replyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!count) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted" });
}
