/**
 * The area of Lebanon you picked at the top of Home (a governorate id), in
 * a cookie: Matches then shows people from there unless you change its own
 * area filter. Empty means all of Lebanon.
 */
export const REGION_COOKIE = "region";

/** Client only. */
export function rememberRegion(id: string) {
  document.cookie = id
    ? `${REGION_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
    : `${REGION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Client only. */
export function savedRegion() {
  return document.cookie.match(new RegExp(`(?:^|; )${REGION_COOKIE}=([^;]*)`))?.[1] ?? "";
}
