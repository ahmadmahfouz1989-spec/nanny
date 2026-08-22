import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

export async function GET() {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();

  const [
    { count: totalParents },
    { count: totalNannies },
    { count: approvedParents },
    { count: approvedNannies },
    { count: pendingProfiles },
    { count: mutualMatches },
    { count: openReports },
    { count: suspendedUsers },
  ] = await Promise.all([
    db.from("parent_profiles").select("id", { count: "exact", head: true }),
    db.from("nanny_profiles").select("id", { count: "exact", head: true }),
    db.from("parent_profiles").select("id", { count: "exact", head: true }).eq("moderation_status", "approved"),
    db.from("nanny_profiles").select("id", { count: "exact", head: true }).eq("moderation_status", "approved"),
    db
      .from("parent_profiles")
      .select("id", { count: "exact", head: true })
      .eq("moderation_status", "pending")
      .then(async (parentRes) => {
        const nannyRes = await db
          .from("nanny_profiles")
          .select("id", { count: "exact", head: true })
          .eq("moderation_status", "pending");
        return { count: (parentRes.count ?? 0) + (nannyRes.count ?? 0) };
      }),
    db.from("matches").select("id", { count: "exact", head: true }).eq("status", "mutual"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("users").select("id", { count: "exact", head: true }).eq("status", "suspended"),
  ]);

  return NextResponse.json({
    totalParents: totalParents ?? 0,
    totalNannies: totalNannies ?? 0,
    approvedParents: approvedParents ?? 0,
    approvedNannies: approvedNannies ?? 0,
    pendingProfiles: pendingProfiles ?? 0,
    mutualMatches: mutualMatches ?? 0,
    openReports: openReports ?? 0,
    suspendedUsers: suspendedUsers ?? 0,
  });
}
