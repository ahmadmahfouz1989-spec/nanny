import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, signupConfirmationEmail, passwordRecoveryEmail, genericAuthEmail } from "@/lib/email";

// Configured as Supabase's "Send Email" Auth Hook — once enabled, Supabase
// stops sending auth emails (signup confirmation, password recovery) itself
// and instead POSTs the token data here for us to deliver via Resend. This
// is what "use Resend completely" for auth emails requires: there's no
// public API to get a token from signUp()/resetPasswordForEmail() without
// also triggering Supabase's own mailer, other than this hook.
const hookSecret = (process.env.SUPABASE_AUTH_HOOK_SECRET ?? "").replace("v1,whsec_", "");

interface HookPayload {
  user: { email: string };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
  };
}

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let parsed: HookPayload;
  try {
    const wh = new Webhook(hookSecret);
    parsed = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    console.error("[email-hook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { user, email_data } = parsed;
  const { token_hash, redirect_to, email_action_type } = email_data;

  // GoTrue's own hosted verify endpoint still redeems the token and applies
  // the Redirect URLs allow-list before forwarding to redirect_to — this
  // hook only replaces who sends the email, not how the link is verified.
  const verifyUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;

  console.log(`[email-hook] action=${email_action_type} redirect_to=${redirect_to} verifyUrl=${verifyUrl}`);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("users")
    .select("preferred_language")
    .eq("email", user.email)
    .maybeSingle();
  const lang = existing?.preferred_language;

  const { subject, html } =
    email_action_type === "signup"
      ? signupConfirmationEmail(lang, verifyUrl)
      : email_action_type === "recovery"
        ? passwordRecoveryEmail(lang, verifyUrl)
        : genericAuthEmail(lang, email_action_type, verifyUrl);

  await sendEmail(user.email, subject, html);

  return NextResponse.json({});
}
