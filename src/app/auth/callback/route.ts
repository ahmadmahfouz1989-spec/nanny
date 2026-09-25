import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/site-url";
import { routing } from "@/i18n/routing";
import { RETURN_PATH_COOKIE, safeReturnPath } from "@/lib/return-path";

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
  // Signup no longer chooses a category up front, so a confirmation link
  // with no explicit `next` (e.g. a bare /signup with no category hint)
  // lands on the hub to choose one, not a specific category's dashboard.
  // Google sign-in carries its destination in a cookie instead (see
  // GoogleAuthButton). Either way it must be a same-origin path.
  const cookieStore = await cookies();
  const cookieNext = cookieStore.get(RETURN_PATH_COOKIE)?.value;
  const next =
    safeReturnPath(searchParams.get("next")) ??
    safeReturnPath(cookieNext ? decodeURIComponent(cookieNext) : null) ??
    "/categories";
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
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
