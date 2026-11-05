import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

/** Finds providers by name for "selected providers", one row per person. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ providers: [] });

  // % and _ are wildcards in ilike: a name search means them literally.
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const { data, error } = await createAdminClient()
    .from("generic_profiles")
    .select("user_id, full_name, categories(name_en, name_ar), users!generic_profiles_user_id_fkey!inner(status)")
    .eq("role", "provider")
    .neq("status", "draft")
    .neq("moderation_status", "rejected")
    .eq("users.status", "active")
    .ilike("full_name", pattern)
    .order("full_name")
    .limit(60);
  if (error) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const people = new Map<string, { user_id: string; name: string; categories_en: string[]; categories_ar: string[] }>();
  for (const row of data ?? []) {
    const person = people.get(row.user_id) ?? { user_id: row.user_id, name: row.full_name, categories_en: [], categories_ar: [] };
    if (row.categories) {
      person.categories_en.push(row.categories.name_en);
      person.categories_ar.push(row.categories.name_ar);
    }
    people.set(row.user_id, person);
  }
  return NextResponse.json({ providers: [...people.values()].slice(0, 20) });
}
