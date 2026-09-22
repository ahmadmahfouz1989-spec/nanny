import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deliberately NOT gated by requireActiveUser: login-form.tsx calls this
// right after signInWithPassword specifically to detect a suspended
// account (`me.user.status === "suspended"`) and show that to the user --
// gating this route would turn that into an opaque 401 with no status to
// read, and a suspended login would silently proceed instead of being
// caught. Every other route wants "not suspended" enforced; this one
// needs to see the suspended state to report it.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, role, email, phone, email_verified_at, phone_verified_at, preferred_language, status, featured_until")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let profileSummary = null;
  if (profile.role === "parent") {
    const { data } = await supabase
      .from("parent_profiles")
      .select("id, status, moderation_status, profile_completion_pct")
      .eq("user_id", user.id)
      .maybeSingle();
    profileSummary = data;
  } else if (profile.role === "nanny") {
    const { data } = await supabase
      .from("nanny_profiles")
      .select("id, status, moderation_status, profile_completion_pct")
      .eq("user_id", user.id)
      .maybeSingle();
    profileSummary = data;
  }

  return NextResponse.json({ user: profile, profile: profileSummary });
}
