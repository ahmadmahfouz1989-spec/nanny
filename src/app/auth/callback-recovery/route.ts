import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

// Dedicated, query-string-free callback for password recovery specifically.
// Kept separate from /auth/callback (rather than using its `?next=` param)
// because Supabase's Redirect URLs allow-list wasn't reliably matching a
// redirectTo with a query string, even with a trailing wildcard — a plain
// path sidesteps that ambiguity entirely.
async function currentLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  return (routing.locales as readonly string[]).includes(cookieLocale ?? "")
    ? cookieLocale!
    : routing.defaultLocale;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const locale = await currentLocale();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}/${locale}/reset-password`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
