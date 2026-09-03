import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const PROTECTED_PREFIXES = ["/categories", "/dashboard", "/onboarding", "/matches", "/messages", "/profile", "/settings", "/admin"];

function splitLocale(pathname: string): { locale: string; rest: string } {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, rest: "/" + segments.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { locale, rest } = splitLocale(request.nextUrl.pathname);
  const isProtected = PROTECTED_PREFIXES.some((p) => rest.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL(`/${locale}/login`, request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isProtected && user) {
    const { data: profile } = await supabase.from("users").select("status").eq("id", user.id).single();
    if (profile?.status === "suspended") {
      await supabase.auth.signOut();
      const redirectUrl = new URL(`/${locale}/login`, request.url);
      redirectUrl.searchParams.set("error", "account_suspended");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
