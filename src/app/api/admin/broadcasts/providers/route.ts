import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

type Person = {
  user_id: string;
  name: string;
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  place_en: string | null;
  place_ar: string | null;
  categories_en: string[];
  categories_ar: string[];
  /** Phones and browsers a push can reach right now. */
  devices: number;
};

const PROFILE_COLUMNS =
  "user_id, full_name, profile_photo_url, categories(name_en, name_ar), locations(name_en, name_ar), users!generic_profiles_user_id_fkey!inner(status, email, phone, contact_phone)";

/**
 * Finds providers for "selected providers", one row per person: by name,
 * email or phone. Each row carries what tells two people of the same name
 * apart (photo, email or phone, area) and whether a push can reach them.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ providers: [] });

  const db = createAdminClient();
  // % and _ are wildcards in ilike: a search means them literally.
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const digits = q.replace(/\D/g, "");
  const providers = () =>
    db
      .from("generic_profiles")
      .select(PROFILE_COLUMNS)
      .eq("role", "provider")
      .neq("status", "draft")
      .neq("moderation_status", "rejected")
      .eq("users.status", "active");

  const contactMatches = [db.from("users").select("id").ilike("email", pattern).limit(20)];
  if (digits.length >= 4) {
    contactMatches.push(db.from("users").select("id").ilike("phone", `%${digits}%`).limit(20));
    contactMatches.push(db.from("users").select("id").ilike("contact_phone", `%${digits}%`).limit(20));
  }
  const matched = await Promise.all(contactMatches);
  const contactIds = [...new Set(matched.flatMap((m) => (m.data ?? []).map((u) => u.id)))];

  const [byName, byContact] = await Promise.all([
    providers().ilike("full_name", pattern).order("full_name").limit(60),
    contactIds.length ? providers().in("user_id", contactIds).limit(60) : null,
  ]);
  if (byName.error || byContact?.error) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const people = new Map<string, Person>();
  for (const row of [...(byName.data ?? []), ...(byContact?.data ?? [])]) {
    const user = row.users;
    const place = Array.isArray(row.locations) ? row.locations[0] : row.locations;
    const person: Person = people.get(row.user_id) ?? {
      user_id: row.user_id,
      name: row.full_name,
      photo_url: row.profile_photo_url,
      email: user?.email ?? null,
      phone: user?.phone ? `+${user.phone.replace(/^\+/, "")}` : (user?.contact_phone ?? null),
      place_en: place?.name_en ?? null,
      place_ar: place?.name_ar ?? null,
      categories_en: [],
      categories_ar: [],
      devices: 0,
    };
    person.photo_url ??= row.profile_photo_url;
    if (row.categories && !person.categories_en.includes(row.categories.name_en)) {
      person.categories_en.push(row.categories.name_en);
      person.categories_ar.push(row.categories.name_ar);
    }
    people.set(row.user_id, person);
  }

  const list = [...people.values()].slice(0, 20);
  const ids = list.map((p) => p.user_id);
  if (ids.length) {
    const [{ data: native }, { data: web }] = await Promise.all([
      db.from("native_push_tokens").select("user_id").in("user_id", ids),
      db.from("push_subscriptions").select("user_id").in("user_id", ids),
    ]);
    for (const row of [...(native ?? []), ...(web ?? [])]) {
      const p = people.get(row.user_id);
      if (p) p.devices++;
    }
  }
  return NextResponse.json({ providers: list });
}
