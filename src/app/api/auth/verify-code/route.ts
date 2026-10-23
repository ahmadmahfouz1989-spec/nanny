import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logLoginEvent } from "@/lib/login-log";

const bodySchema = z.object({
  email: z.string().email(),
  // 6 by default; whatever Supabase's "Email OTP length" is set to.
  code: z.string().regex(/^\d{6,10}$/),
});

/**
 * Finishes an email sign-up with the 6-digit code from the confirmation
 * email -- the same one-time token the email's link carries, typed in
 * instead of clicked, so signing up in the app never leaves it for the
 * browser. Like /auth/confirm, it signs the person in here and marks the
 * email verified.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "signup" });
  if (error || !data.user) {
    // Wrong or expired code -- the form says so and offers a new one.
    return NextResponse.json({ error: "wrong_code" }, { status: 400 });
  }

  // email_verified_at is service-role only (see /auth/confirm).
  await createAdminClient().from("users").update({ email_verified_at: new Date().toISOString() }).eq("id", data.user.id);
  void logLoginEvent(request, data.user.id);

  return NextResponse.json({ ok: true });
}
