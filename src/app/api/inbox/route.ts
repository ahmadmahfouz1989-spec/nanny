import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allConversations } from "@/lib/inbox";

/**
 * One conversation list across every category an account is active in --
 * nanny/parent plus every generic category (nursing, tutoring, ...) --
 * so someone with, say, both a nanny and a nursing profile checks a
 * single inbox instead of two separate pages.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [{ data: profile }, conversations] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    allConversations(supabase, user.id),
  ]);

  return NextResponse.json({ role: profile?.role ?? null, conversations });
}
