import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/site-url";
import { routing } from "@/i18n/routing";
import { RETURN_PATH_COOKIE, safeReturnPath } from "@/lib/return-path";
import { reportMetaEvent } from "@/lib/meta-capi";

// An account created this recently is a sign-up, not a returning sign-in.
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

async function currentLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  return (routing.locales as readonly string[]).includes(cookieLocale ?? "")
    ? cookieLocale!
    : routing.defaultLocale;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getPublicOrigin(request);
  const code = searchParams.get("code");
  // With no explicit `next`, a sign-in lands on the welcome question
  // ("what brings you here?"), which sends anyone who already has a
  // profile on to Home.
  // Google sign-in carries its destination in a cookie instead (see
  // GoogleAuthButton). Either way it must be a same-origin path.
  const cookieStore = await cookies();
  const cookieNext = cookieStore.get(RETURN_PATH_COOKIE)?.value;
  const next =
    safeReturnPath(searchParams.get("next")) ??
    safeReturnPath(cookieNext ? decodeURIComponent(cookieNext) : null) ??
    "/welcome";
  const locale = await currentLocale();

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      // email_verified_at is locked to service_role only (see
      // 20260923000006_lock_verification_fields.sql) -- the user's own
      // session client can no longer write it, by design.
      await createAdminClient()
        .from("users")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("id", data.user.id);
    }

    if (!error) {
      const response = NextResponse.redirect(`${origin}/${locale}${next}`);
      response.cookies.delete(RETURN_PATH_COOKIE);

      // A brand-new Google or Apple account is a sign-up for Meta. Email
      // sign-ups are reported by /api/auth/signup instead, so they're
      // skipped here to avoid counting twice.
      const createdAt = data.user?.created_at ? Date.parse(data.user.created_at) : NaN;
      const provider = data.user?.app_metadata?.provider;
      if (provider && provider !== "email" && Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS) {
        await reportMetaEvent("CompleteRegistration", {
          user: { id: data.user!.id, email: data.user!.email, fullName: data.user!.user_metadata?.full_name },
          params: { content_name: provider },
          sourceUrl: `${origin}/${locale}${next}`,
          cookieTarget: response.cookies,
        });
      }
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
