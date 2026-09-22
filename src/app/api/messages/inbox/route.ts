import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { nannyConversations } from "@/lib/inbox";

// Kept for backward compatibility -- the app itself now fetches the
// unified list from /api/inbox instead. Delegates to the same shared
// logic that endpoint uses for the nanny/parent half of its result.
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  const conversations = await nannyConversations(supabase, user.id);

  return NextResponse.json({ role: profile?.role ?? null, conversations });
}
