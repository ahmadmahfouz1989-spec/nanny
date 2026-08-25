/**
 * The public origin to use when building absolute URLs (redirects, email
 * links) from a server-side request. `new URL(request.url).origin` looks
 * right but resolves to the container's internal address (e.g.
 * http://localhost:8080) on Railway, not the public domain — Railway's edge
 * doesn't rewrite the request URL the way some other platforms do. Falls
 * back to request.url's origin for local dev, where RAILWAY_PUBLIC_DOMAIN
 * isn't set and request.url is already correct (no proxy involved).
 */
export function getPublicOrigin(request: Request): string {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return new URL(request.url).origin;
}
