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
