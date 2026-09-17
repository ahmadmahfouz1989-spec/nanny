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
  const type = searchParams.get("type"); // 'parent' | 'nanny' | 'generic' | null (all)

  const db = createAdminClient();

  const [parents, nannies, generics] = await Promise.all([
    type === "nanny"
      ? Promise.resolve({ data: [] })
      : db
          .from("parent_profiles")
          .select(
            "id, full_name, profile_photo_url, status, moderation_status, created_at, updated_at, location_detail, nationality, locations(name_en, name_ar, name_fr), " +
              "num_children, children_age_ranges, schedule_type, live_arrangement, desired_start_date, " +
              "transportation_required, additional_duties, family_description, " +
              "parent_profile_languages(languages(id, name_en, name_ar, name_fr))",
          )
          .eq("moderation_status", moderationStatus)
          .order("created_at", { ascending: true }),
    type === "parent"
      ? Promise.resolve({ data: [] })
      : db
          .from("nanny_profiles")
          .select(
            "id, full_name, profile_photo_url, status, moderation_status, created_at, updated_at, location_detail, nationality, locations(name_en, name_ar, name_fr), " +
              "work_radius_km, employment_type, live_arrangement_pref, availability, years_experience, " +
              "has_transportation, can_drive, certifications, short_intro, " +
              "nanny_profile_languages(languages(id, name_en, name_ar, name_fr)), nanny_experience(age_group, years_experience)",
          )
          .eq("moderation_status", moderationStatus)
          .order("created_at", { ascending: true }),
    type === "parent" || type === "nanny"
      ? Promise.resolve({ data: [] })
      : db
          .from("generic_profiles")
          .select(
            "id, full_name, role, attributes, status, moderation_status, created_at, updated_at, " +
              "locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)",
          )
          .eq("moderation_status", moderationStatus)
          // Excludes the placeholder row created the instant a role is
          // picked on a category's onboarding screen (see
          // /api/generic-profile/claim) -- that's not a real submission
          // yet, just what makes the nav show up early.
          .neq("status", "draft")
          .order("created_at", { ascending: true }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentRows = (parents.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nannyRows = (nannies.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genericRows = (generics.data ?? []) as any[];

  const results = [
    ...parentRows.map((p) => ({ ...p, profileType: "parent" as const })),
    ...nannyRows.map((n) => ({ ...n, profileType: "nanny" as const })),
    ...genericRows.map((g) => ({
      ...g,
      profileType: "generic" as const,
      categorySlug: g.categories?.slug ?? null,
    })),
  ].sort((a, b) => (a.created_at as string).localeCompare(b.created_at as string));

  return NextResponse.json({ profiles: results });
}
