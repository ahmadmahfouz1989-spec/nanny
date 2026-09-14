import { createAdminClient } from "@/lib/supabase/admin";

/** Railway (and most proxies) set this to "client, proxy1, proxy2, ..." — the real client is the first hop. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

function isPrivateOrLocal(ip: string): boolean {
  return (
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

/**
 * Best-effort: resolves the request's IP to a country via a free
 * geolocation lookup and records a login_events row. Never throws --
 * this is purely observational, so a lookup failure or a slow network
 * blip must never block or fail the actual sign-in it's attached to.
 */
export async function logLoginEvent(request: Request, userId: string | null): Promise<void> {
  try {
    const ip = clientIp(request);
    let country: string | null = null;
    let countryCode: string | null = null;
    let city: string | null = null;

    if (ip && !isPrivateOrLocal(ip)) {
      const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const geo = await res.json();
        if (!geo.error) {
          country = geo.country_name ?? null;
          countryCode = geo.country_code ?? null;
          city = geo.city ?? null;
        }
      }
    }

    const admin = createAdminClient();
    await admin.from("login_events").insert({
      user_id: userId,
      ip,
      country,
      country_code: countryCode,
      city,
      user_agent: request.headers.get("user-agent"),
    });
  } catch (err) {
    console.error("[login-log] failed to record login event:", err);
  }
}
