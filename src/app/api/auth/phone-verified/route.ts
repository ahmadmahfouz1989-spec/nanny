import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminsOfNewSignup } from "@/lib/signup-notify";

// An account this young, signing in with its phone for the first time, is
// a new WhatsApp sign-up rather than an existing user adding a login.
const NEW_ACCOUNT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Called by the WhatsApp sign-in form right after a code is accepted.
 * Records the phone as verified (phone_verified_at is writable by the
 * service role only) and, the first time for a brand-new account, tells
 * the admins -- the same "new sign-up" email an email sign-up sends.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.phone || !user.phone_confirmed_at) {
    return NextResponse.json({ error: "No verified phone on this session" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Only the first call flips it, so the admin email can't be sent twice.
  const { data: firstTime } = await admin
    .from("users")
    .update({ phone_verified_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("phone_verified_at", null)
    .select("id")
    .maybeSingle();

  const isNew = Date.now() - Date.parse(user.created_at) < NEW_ACCOUNT_WINDOW_MS;
  if (firstTime && isNew) await notifyAdminsOfNewSignup(`+${user.phone}`);

  return NextResponse.json({ newAccount: Boolean(firstTime && isNew) });
}
