/**
 * The service (category) you were last in -- the dashboard you last
 * opened, or the profile you last picked on Profile -- remembered in a
 * cookie, so the phone's Matches tab, /dashboard and /profile bring you
 * back to it instead of always to your first service (nanny).
 */
export const LAST_CATEGORY_COOKIE = "last_category";

/** Client only. */
export function rememberCategory(slug: string) {
  document.cookie = `${LAST_CATEGORY_COOKIE}=${slug}; path=/; max-age=31536000; samesite=lax`;
}

/** Client only. */
export function lastCategory() {
  return document.cookie.match(new RegExp(`(?:^|; )${LAST_CATEGORY_COOKIE}=([^;]*)`))?.[1] ?? null;
}

/**
 * The side you last looked at in a service where you have both, so coming
 * back doesn't quietly flip you to the other one.
 */
export const lastRoleCookie = (slug: string) => `last_role_${slug}`;

/** Client only. */
export function rememberRole(slug: string, role: "seeker" | "provider") {
  document.cookie = `${lastRoleCookie(slug)}=${role}; path=/; max-age=31536000; samesite=lax`;
}

/** Client only. */
export function lastRole(slug: string): "seeker" | "provider" | null {
  const value = document.cookie.match(new RegExp(`(?:^|; )${lastRoleCookie(slug)}=([^;]*)`))?.[1];
  return value === "seeker" || value === "provider" ? value : null;
}
