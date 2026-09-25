import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const moderationStatus = searchParams.get("moderationStatus") ?? "pending";
  const categorySlug = searchParams.get("categorySlug"); // null = every category
  const role = searchParams.get("role"); // 'seeker' | 'provider' | null = both

  const db = createAdminClient();

  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: category } = await db.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
    if (!category) {
      return NextResponse.json({ profiles: [] });
    }
    categoryId = category.id;
  }

  let query = db
    .from("generic_profiles")
    .select(
      "id, user_id, full_name, profile_photo_url, role, attributes, status, moderation_status, created_at, updated_at, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar), users(email, contact_phone, status)",
    )
    .eq("moderation_status", moderationStatus)
    // Excludes the placeholder row created the instant a role is picked
    // on a category's onboarding screen (see /api/generic-profile/claim)
    // -- that's not a real submission yet, just what makes the nav show
    // up early.
    .neq("status", "draft")
    .order("created_at", { ascending: true });
  if (categoryId) query = query.eq("category_id", categoryId);
  if (role) query = query.eq("role", role);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Languages are stored as bare ids in attributes -- resolve them for the
  // reviewer.
  const languageIds = [
    ...new Set(
      (rows ?? []).flatMap((r) => {
        const ids = (r.attributes as { languageIds?: unknown } | null)?.languageIds;
        return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
      }),
    ),
  ];
  const { data: languages } = languageIds.length
    ? await db.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds)
    : { data: [] as { id: string; name_en: string; name_ar: string; name_fr: string }[] };
  const languageById = new Map((languages ?? []).map((l) => [l.id, l]));

  const profiles = (rows ?? []).map((r) => {
    const ids = (r.attributes as { languageIds?: unknown } | null)?.languageIds;
    return {
      ...r,
      languages: (Array.isArray(ids) ? ids : []).map((id) => languageById.get(id)).filter(Boolean),
    };
  });

  return NextResponse.json({ profiles });
}
