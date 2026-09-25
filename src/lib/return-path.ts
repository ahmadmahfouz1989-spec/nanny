import { routing } from "@/i18n/routing";

// Name of the short-lived cookie that carries a return destination through
// Google OAuth. The OAuth redirectTo URL itself is checked against
// Supabase's redirect allow-list, so the destination can't ride along as
// a query parameter there without risking that check.
export const RETURN_PATH_COOKIE = "post_auth_next";

/**
 * Normalizes a post-sign-in destination to a same-origin, locale-less path
 * (pathname + query), or null if it isn't one. Locale-less because every
 * consumer re-adds the locale itself (the next-intl router, or the auth
 * callback's `/${locale}` prefix) -- keeping it here would double it.
 * Rejects anything that could leave the site: absolute URLs,
 * protocol-relative `//host`, and backslash tricks browsers treat as `/`.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://internal.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://internal.invalid") return null;

  const segments = url.pathname.split("/");
  const path = (routing.locales as readonly string[]).includes(segments[1] ?? "")
    ? "/" + segments.slice(2).join("/")
    : url.pathname;
  return path + url.search;
}
