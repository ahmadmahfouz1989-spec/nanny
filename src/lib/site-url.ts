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
