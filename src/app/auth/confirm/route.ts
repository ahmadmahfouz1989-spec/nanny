import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";
import { routing } from "@/i18n/routing";
import type { EmailOtpType } from "@supabase/supabase-js";

// Magic-link landing route. The email hook (src/app/api/auth/email-hook)
// points every auth link here with the raw token_hash rather than routing
// through Supabase's /auth/v1/verify endpoint. verifyOtp() confirms the
// token AND writes the session cookies in one step, with no PKCE code
// verifier required — so the link logs the user in even when it's opened
// on a different device or browser than the one they signed up on.

async function currentLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  return (routing.locales as readonly string[]).includes(cookieLocale ?? "")
    ? cookieLocale!
    : routing.defaultLocale;
}

// Only allow same-site, absolute paths as a post-confirm destination so the
// `next` param can't be used as an open redirect.
function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getPublicOrigin(request);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const locale = await currentLocale();

  const fallbackNext = type === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeNext(searchParams.get("next"), fallbackNext);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (!error) {
      if (type === "signup" && data.user?.id) {
        await supabase
          .from("users")
          .update({ email_verified_at: new Date().toISOString() })
          .eq("id", data.user.id);
      }
      return NextResponse.redirect(`${origin}/${locale}${next}`);
    }

    console.error("[auth/confirm] verifyOtp failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
