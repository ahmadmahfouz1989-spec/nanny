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
  conversations: number;
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
    { data: conversations },
    { count: openReports },
    { count: suspendedUsers },
    { data: recentCalls },
  ] = await Promise.all([
    db.from("categories").select("id, slug, name_en, name_ar, status").order("sort_order", { ascending: true }),
    // A draft row is just a claimed role with nothing filled in yet (see
    // /api/generic-profile/claim) -- not a profile anyone can be shown.
    db.from("generic_profiles").select("category_id, role, moderation_status").neq("status", "draft"),
    db.from("generic_matches").select("category_id").not("last_message_at", "is", null),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("users").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    db
      .from("calls")
      .select("status, answered_at, ended_at")
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .limit(20000),
  ]);

  // Whether calls actually connect: answered, never picked up, or the two
  // phones couldn't reach each other (a sign the relay servers aren't working).
  const callRows = recentCalls ?? [];
  const lengths = callRows
    .filter((c) => c.answered_at && c.ended_at)
    .map((c) => (Date.parse(c.ended_at!) - Date.parse(c.answered_at!)) / 1000)
    .filter((sec) => sec >= 0 && sec < 4 * 3600);
  const calls = {
    total: callRows.length,
    answered: callRows.filter((c) => c.answered_at).length,
    noAnswer: callRows.filter((c) => !c.answered_at && ["missed", "declined", "busy"].includes(c.status)).length,
    failed: callRows.filter((c) => c.status === "failed").length,
    avgSeconds: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null,
  };

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
      conversations: (conversations ?? []).filter((m) => m.category_id === category.id).length,
    };
  });

  return NextResponse.json({
    categories: stats,
    totalProfiles: stats.reduce((sum, c) => sum + c.providers + c.seekers, 0),
    pendingProfiles: stats.reduce((sum, c) => sum + c.pending, 0),
    conversations: stats.reduce((sum, c) => sum + c.conversations, 0),
    openReports: openReports ?? 0,
    suspendedUsers: suspendedUsers ?? 0,
    calls,
  });
}
