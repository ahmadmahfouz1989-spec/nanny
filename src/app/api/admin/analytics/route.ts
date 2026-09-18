import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

// Nanny predates generic_profiles and keeps its own tables: parents are its
// seekers, nannies its providers. Every other category counts out of
// generic_profiles.
const NANNY_SLUG = "nanny";

type CategoryStats = {
  slug: string;
  nameEn: string;
  nameAr: string;
  status: string;
  providers: number;
  seekers: number;
  pending: number;
  mutualMatches: number;
};

export async function GET() {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();

  const [
    { data: categories },
    { data: genericProfiles },
    { data: genericMutual },
    { count: totalParents },
    { count: totalNannies },
    { count: pendingParents },
    { count: pendingNannies },
    { count: nannyMutual },
    { count: openReports },
    { count: suspendedUsers },
  ] = await Promise.all([
    db.from("categories").select("id, slug, name_en, name_ar, status").order("sort_order", { ascending: true }),
    // A draft row is just a claimed role with nothing filled in yet (see
    // /api/generic-profile/claim) -- not a profile anyone can be shown.
    db.from("generic_profiles").select("category_id, role, moderation_status").neq("status", "draft"),
    db.from("generic_matches").select("category_id").eq("status", "mutual"),
    db.from("parent_profiles").select("id", { count: "exact", head: true }),
    db.from("nanny_profiles").select("id", { count: "exact", head: true }),
    db.from("parent_profiles").select("id", { count: "exact", head: true }).eq("moderation_status", "pending"),
    db.from("nanny_profiles").select("id", { count: "exact", head: true }).eq("moderation_status", "pending"),
    db.from("matches").select("id", { count: "exact", head: true }).eq("status", "mutual"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("users").select("id", { count: "exact", head: true }).eq("status", "suspended"),
  ]);

  const stats: CategoryStats[] = (categories ?? []).map((category) => {
    if (category.slug === NANNY_SLUG) {
      return {
        slug: category.slug,
        nameEn: category.name_en,
        nameAr: category.name_ar,
        status: category.status,
        providers: totalNannies ?? 0,
        seekers: totalParents ?? 0,
        pending: (pendingParents ?? 0) + (pendingNannies ?? 0),
        mutualMatches: nannyMutual ?? 0,
      };
    }

    const mine = (genericProfiles ?? []).filter((p) => p.category_id === category.id);
    return {
      slug: category.slug,
      nameEn: category.name_en,
      nameAr: category.name_ar,
      status: category.status,
      providers: mine.filter((p) => p.role === "provider").length,
      seekers: mine.filter((p) => p.role === "seeker").length,
      pending: mine.filter((p) => p.moderation_status === "pending").length,
      mutualMatches: (genericMutual ?? []).filter((m) => m.category_id === category.id).length,
    };
  });

  return NextResponse.json({
    categories: stats,
    totalProfiles: stats.reduce((sum, c) => sum + c.providers + c.seekers, 0),
    pendingProfiles: stats.reduce((sum, c) => sum + c.pending, 0),
    mutualMatches: stats.reduce((sum, c) => sum + c.mutualMatches, 0),
    openReports: openReports ?? 0,
    suspendedUsers: suspendedUsers ?? 0,
  });
}
