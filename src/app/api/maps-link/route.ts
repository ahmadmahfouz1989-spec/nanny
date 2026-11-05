import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { isGoogleHost, parseMapsLink } from "@/lib/place-input";

const MAX_HOPS = 6;

/**
 * Follows a short Google Maps link (maps.app.goo.gl/...), which a browser
 * can't do across sites, and answers with the coordinates in the address it
 * lands on, or the place's name when only that is known. Signed-in people only, and only ever to
 * Google's own hosts over https, so it can't be aimed at anything else.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const first = parseMapsLink(new URL(request.url).searchParams.get("url") ?? "");
  if (!first) return NextResponse.json({ error: "Not a Google Maps link" }, { status: 400 });
  if (first.kind === "point") return NextResponse.json({ point: first.point });
  if (first.kind === "query") return NextResponse.json({ query: first.text });

  let current = first.url;
  let name: string | null = null;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const url = new URL(current);
      if (url.protocol !== "https:" || !isGoogleHost(url.hostname)) break;

      // A consent page holds the real address in `continue`.
      const held = url.hostname.startsWith("consent.") ? url.searchParams.get("continue") : null;
      if (held) {
        current = held;
        continue;
      }
      const parsed = parseMapsLink(url.href);
      if (parsed?.kind === "point") return NextResponse.json({ point: parsed.point });
      if (parsed?.kind === "query") name = parsed.text;

      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ouiKnow)", "Accept-Language": "en" },
      });
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) {
        current = new URL(next, url).href;
        continue;
      }
      // The page itself is no help: its map starts wherever the visitor (this
      // server) seems to be -- Montreal, for a place in Beirut -- so a
      // location read from it would be confidently wrong. Only the address
      // can be trusted; with no coordinates there, the name goes to a search.
      break;
    }
  } catch {
    // Timed out or unreachable: answered below like any link we can't read.
  }
  if (name) return NextResponse.json({ query: name });
  return NextResponse.json({ error: "No location found in that link" }, { status: 404 });
}
