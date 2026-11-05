import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { containsContactInfo } from "@/lib/content-filter";
import { SAVED_KINDS, savedPlaces } from "@/lib/saved-places";

const saveSchema = z.object({
  kind: z.enum(SAVED_KINDS),
  point: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  address: z.string().trim().max(300).optional(),
  name: z.string().trim().max(160).optional(),
});

/** The caller's Home, Work and recent places. */
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ places: await savedPlaces(createAdminClient(), user.id) });
}

/** Saves a place as the caller's Home or Work, replacing the one before. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the place" }, { status: 400 });
  const { kind, point, address, name } = parsed.data;
  if (name && containsContactInfo(name)) return NextResponse.json({ error: "Please remove phone numbers from the name" }, { status: 400 });

  const db = createAdminClient();
  await db.from("saved_places").delete().eq("user_id", user.id).eq("kind", kind);
  const { error } = await db.from("saved_places").insert({ user_id: user.id, kind, lat: point.lat, lng: point.lng, address: address || null, name: name || null });
  if (error) return NextResponse.json({ error: "That place couldn't be saved" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Removes the caller's saved place: `?id=`. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Check the place" }, { status: 400 });
  await createAdminClient().from("saved_places").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
