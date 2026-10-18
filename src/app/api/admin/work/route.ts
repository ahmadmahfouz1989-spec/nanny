import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

/**
 * The latest work providers added, newest first -- only projects with at
 * least one photo (a project with none isn't shown to anyone). Work goes
 * live without review; this is where admins look over it and remove
 * anything that breaks the rules.
 */
export async function GET() {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data, error } = await createAdminClient()
    .from("work_projects")
    .select(
      "id, title, description, created_at, updated_at, profile_id, generic_profiles(full_name, categories(name_en, name_ar)), work_photos!inner(id, url, caption, position)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const projects = (data ?? []).map((p) => ({
    ...p,
    work_photos: [...p.work_photos].sort((a, b) => a.position - b.position),
  }));
  return NextResponse.json({ projects });
}
