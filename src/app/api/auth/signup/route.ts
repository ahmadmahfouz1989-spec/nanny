import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signupSchema } from "@/lib/validation/auth";
import { sendEmail, alreadyRegisteredEmail } from "@/lib/email";
import { notifyAdminsOfNewSignup } from "@/lib/signup-notify";
import { getPublicOrigin } from "@/lib/site-url";
import { reportMetaEvent } from "@/lib/meta-capi";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, preferredLanguage } = parsed.data;
  const supabase = await createClient();
  const origin = getPublicOrigin(request);
  const metadata = { preferred_language: preferredLanguage };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata, emailRedirectTo: `${origin}/auth/callback` },
  });

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
  } else if (data.user) {
    await notifyAdminsOfNewSignup(email!);
    await reportMetaEvent("CompleteRegistration", { user: { id: data.user.id, email }, params: { content_name: "email" } });
  }

  // With email confirmation off (local development) Supabase signs the
  // new account straight in; otherwise the form asks for the emailed code.
  return NextResponse.json({ user: data.user, signedIn: !!data.session }, { status: 201 });
}
