import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";
import { routing } from "@/i18n/routing";

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
  const next = searchParams.get("next") ?? "/dashboard";
  const locale = await currentLocale();

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      await supabase
        .from("users")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("id", data.user.id);
    }

    if (!error) {
      return NextResponse.redirect(`${origin}/${locale}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
