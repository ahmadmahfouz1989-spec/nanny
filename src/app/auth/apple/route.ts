import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { routing } from "@/i18n/routing";
import { safeReturnPath } from "@/lib/return-path";

/**
 * Native Sign in with Apple in the iPhone app (AppleAuthButton). The app
 * hands over Apple's identity token and the nonce it was made for; signing
 * in here, rather than in the page, sets the session cookies the same way
 * /auth/callback does for Google.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : null;
  const nonce = typeof body?.nonce === "string" ? body.nonce : null;
  if (!token || !nonce) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token, nonce });
  if (error || !data.user) return NextResponse.json({ error: "auth_failed" }, { status: 401 });

  // Apple only hands out verified addresses (including its private relay
  // ones). email_verified_at is service_role only -- see /auth/callback.
  if (data.user.email) {
    await createAdminClient()
      .from("users")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", data.user.id);
  }

  const locale = (routing.locales as readonly string[]).includes(body?.locale) ? body.locale : routing.defaultLocale;
  const next = safeReturnPath(body?.next) ?? "/welcome";
  return NextResponse.json({ redirect: `/${locale}${next}` });
}
