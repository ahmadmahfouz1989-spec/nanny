import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

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
    { data: profiles },
    { data: mutualMatches },
    { count: openReports },
    { count: suspendedUsers },
  ] = await Promise.all([
    db.from("categories").select("id, slug, name_en, name_ar, status").order("sort_order", { ascending: true }),
    // A draft row is just a claimed role with nothing filled in yet (see
    // /api/generic-profile/claim) -- not a profile anyone can be shown.
    db.from("generic_profiles").select("category_id, role, moderation_status").neq("status", "draft"),
    db.from("generic_matches").select("category_id").eq("status", "mutual"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("users").select("id", { count: "exact", head: true }).eq("status", "suspended"),
  ]);

  const stats: CategoryStats[] = (categories ?? []).map((category) => {
    const mine = (profiles ?? []).filter((p) => p.category_id === category.id);
    return {
      slug: category.slug,
      nameEn: category.name_en,
      nameAr: category.name_ar,
      status: category.status,
      providers: mine.filter((p) => p.role === "provider").length,
      seekers: mine.filter((p) => p.role === "seeker").length,
      pending: mine.filter((p) => p.moderation_status === "pending").length,
      mutualMatches: (mutualMatches ?? []).filter((m) => m.category_id === category.id).length,
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
