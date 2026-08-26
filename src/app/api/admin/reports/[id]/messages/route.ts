import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

// Reports only record reporter/reported user ids, not a match — so a
// conversation only exists to show here if the two of them ended up in a
// mutual match with each other. Goes through the service role throughout:
// this is a deliberate cross-user read for moderation, same pattern as the
// contact-reveal route, not something either party's own RLS should allow.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const db = createAdminClient();

  const { data: report } = await db
    .from("reports")
    .select("reporter_user_id, reported_user_id")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { data: users } = await db
    .from("users")
    .select("id, role")
    .in("id", [report.reporter_user_id, report.reported_user_id]);

  const roleById = new Map((users ?? []).map((u) => [u.id, u.role]));

  async function profileFor(userId: string) {
    const role = roleById.get(userId);
    if (role === "parent") {
      const { data } = await db.from("parent_profiles").select("id").eq("user_id", userId).maybeSingle();
      return data ? { side: "parent" as const, profileId: data.id as string } : null;
    }
    if (role === "nanny") {
      const { data } = await db.from("nanny_profiles").select("id").eq("user_id", userId).maybeSingle();
      return data ? { side: "nanny" as const, profileId: data.id as string } : null;
    }
    return null;
  }

  const reporterProfile = await profileFor(report.reporter_user_id);
  const reportedProfile = await profileFor(report.reported_user_id);

  if (!reporterProfile || !reportedProfile || reporterProfile.side === reportedProfile.side) {
    return NextResponse.json({ matchId: null, messages: [] });
  }

  const parentProfileId = reporterProfile.side === "parent" ? reporterProfile.profileId : reportedProfile.profileId;
  const nannyProfileId = reporterProfile.side === "nanny" ? reporterProfile.profileId : reportedProfile.profileId;

  const { data: match } = await db
    .from("matches")
    .select("id, status")
    .eq("parent_profile_id", parentProfileId)
    .eq("nanny_profile_id", nannyProfileId)
    .maybeSingle();

  if (!match || match.status !== "mutual") {
    return NextResponse.json({ matchId: null, messages: [] });
  }

  const { data: messages } = await db
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: true });

  const withSide = (messages ?? []).map((m) => ({
    id: m.id as string,
    body: m.body as string,
    created_at: m.created_at as string,
    isReporter: m.sender_id === report.reporter_user_id,
  }));

  return NextResponse.json({ matchId: match.id, messages: withSide });
}
