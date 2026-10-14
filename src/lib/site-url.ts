/**
 * The public origin to use when building absolute URLs (redirects, email
 * links) from a server-side request.
 *
 * `new URL(request.url).origin` looks right but resolves to the container's
 * internal address (e.g. http://localhost:8080) on Railway, not the public
 * domain — Railway's edge doesn't rewrite the request URL the way some
 * other platforms do.
 *
 * `RAILWAY_PUBLIC_DOMAIN` fixes that, but it's always the auto-generated
 * `*.up.railway.app` host — it does NOT change when a custom domain is
 * attached. Every email link would otherwise point at the raw Railway
 * subdomain instead of the real one. APP_URL, when set, is the deliberate
 * override for "this is the domain users actually see."
 */
export function getPublicOrigin(request: Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return new URL(request.url).origin;
}

/**
 * The APP_URL address to send a request to when it arrived on the other half
 * of the bare/www pair (oui-know.com vs www.oui-know.com), or null to serve
 * it as is. Session cookies are per-host, so serving both meant signing in on
 * one left you signed out on the other -- and a home-screen app, which always
 * starts on the host it was installed from, asked for sign-in on every launch.
 * Only that pair is redirected: Railway's own *.up.railway.app host and
 * localhost keep working, and nothing happens without APP_URL.
 */
export function canonicalHostRedirect(host: string | null, pathAndSearch: string): string | null {
  if (!process.env.APP_URL || !host) return null;
  const canonical = new URL(process.env.APP_URL);
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  if (host.toLowerCase() === canonical.host || bare(host) !== bare(canonical.host)) return null;
  return new URL(pathAndSearch, canonical.origin).toString();
}
