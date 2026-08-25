import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema } from "@/lib/validation/auth";
import { sendEmail, alreadyRegisteredEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { role, email, password, preferredLanguage } = parsed.data;
  const supabase = await createClient();
  const metadata = { role, preferred_language: preferredLanguage };

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });

  if (error) {
    // Supabase returns a generic-enough message; avoid echoing raw provider errors
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Supabase deliberately returns success (no error) for an email that's
  // already registered, signaled only by an empty identities array — this
  // is intentional, to avoid leaking which emails exist via the UI. We keep
  // that same generic response, but nudge the actual account owner via
  // email instead of silently doing nothing (no confirmation email is sent
  // in this case, since no new account was created).
  if (data.user && data.user.identities?.length === 0) {
    const origin = new URL(request.url).origin;
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("users")
      .select("preferred_language")
      .eq("id", data.user.id)
      .maybeSingle();

    const { subject, html } = alreadyRegisteredEmail(
      existing?.preferred_language,
      `${origin}/login`,
      `${origin}/recover`,
    );
    await sendEmail(email!, subject, html);
  }

  return NextResponse.json({ user: data.user }, { status: 201 });
}
