import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { pixelUserData, reportMetaEvent, type MetaUser } from "@/lib/meta-capi";
import { BROWSER_META_EVENTS } from "@/lib/meta-events";

// The Conversions API copy of an event the browser Pixel just sent (page
// views, profile views, searches), under the same event ID. It reaches
// Meta even when an ad blocker stopped the Pixel itself.
const bodySchema = z.object({
  name: z.enum(BROWSER_META_EVENTS),
  eventId: z.string().min(8).max(64),
  url: z.url().max(2000),
  params: z
    .object({
      content_type: z.string().max(40),
      content_ids: z.array(z.string().max(64)).max(5),
      content_category: z.string().max(40),
      search_string: z.string().max(100),
    })
    .partial()
    .optional(),
});

// Claims from the session cookie: enough to tell Meta who it is, without
// a round trip to the auth server on every page view.
async function signedInUser(): Promise<MetaUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims;
  if (!claims) return null;
  const fullName = (claims.user_metadata as { full_name?: unknown } | undefined)?.full_name;
  return { id: claims.sub, email: claims.email, phone: claims.phone, fullName: typeof fullName === "string" ? fullName : null };
}

// The signed-in person's hashed email/phone/ID for the Pixel's advanced
// matching (components/meta-pixel.tsx), the same hashes the server sends,
// so browser events match as well as server ones. Empty when signed out.
export async function GET() {
  return NextResponse.json(pixelUserData(await signedInUser()), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const { name, eventId, url, params } = parsed.data;
  await reportMetaEvent(name, {
    eventId,
    sourceUrl: url,
    params,
    pixel: false,
    user: await signedInUser(),
  });
  return new NextResponse(null, { status: 204 });
}
