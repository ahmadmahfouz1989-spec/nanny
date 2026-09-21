import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

type Admin = ReturnType<typeof createAdminClient>;
type ConversationMessage = { id: string; body: string; created_at: string; isReporter: boolean };

// Reports only record reporter/reported user ids, not a match -- so a
// conversation only exists to show here if the two of them ended up in a
// mutual match with each other, on either the legacy nanny/parent track
// or a generic_matches one (nursing, tutoring, ...). Goes through the
// service role throughout: this is a deliberate cross-user read for
// moderation, same pattern as the contact-reveal route, not something
// either party's own RLS should allow.

async function legacyConversation(
  db: Admin,
  roleById: Map<string, string | null>,
  reporterUserId: string,
  reportedUserId: string,
): Promise<{ matchId: string; messages: ConversationMessage[] } | null> {
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

  const reporterProfile = await profileFor(reporterUserId);
  const reportedProfile = await profileFor(reportedUserId);
  if (!reporterProfile || !reportedProfile || reporterProfile.side === reportedProfile.side) {
    return null;
  }

  const parentProfileId = reporterProfile.side === "parent" ? reporterProfile.profileId : reportedProfile.profileId;
  const nannyProfileId = reporterProfile.side === "nanny" ? reporterProfile.profileId : reportedProfile.profileId;

  const { data: match } = await db
    .from("matches")
    .select("id, status")
    .eq("parent_profile_id", parentProfileId)
    .eq("nanny_profile_id", nannyProfileId)
    .maybeSingle();

  if (!match || match.status !== "mutual") return null;

  const { data: messages } = await db
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: true });

  return {
    matchId: match.id,
    messages: (messages ?? []).map((m) => ({
      id: m.id as string,
      body: m.body as string,
      created_at: m.created_at as string,
      isReporter: m.sender_id === reporterUserId,
    })),
  };
}

async function genericConversation(
  db: Admin,
  reporterUserId: string,
  reportedUserId: string,
): Promise<{ matchId: string; messages: ConversationMessage[] } | null> {
  const { data: profiles } = await db
    .from("generic_profiles")
    .select("id, user_id")
    .in("user_id", [reporterUserId, reportedUserId]);

  const reporterProfileIds = (profiles ?? []).filter((p) => p.user_id === reporterUserId).map((p) => p.id);
  const reportedProfileIds = (profiles ?? []).filter((p) => p.user_id === reportedUserId).map((p) => p.id);
  if (reporterProfileIds.length === 0 || reportedProfileIds.length === 0) return null;

  // Two plain queries (one per direction) rather than an OR'd IN-list
  // string, same reasoning as resolveGenericMatchAccess in
  // generic-access.ts -- keeps this unambiguous rather than hand-building
  // a PostgREST filter expression.
  const [{ data: reporterAsSeeker }, { data: reportedAsSeeker }] = await Promise.all([
    db
      .from("generic_matches")
      .select("id, status")
      .eq("status", "mutual")
      .in("seeker_profile_id", reporterProfileIds)
      .in("provider_profile_id", reportedProfileIds),
    db
      .from("generic_matches")
      .select("id, status")
      .eq("status", "mutual")
      .in("seeker_profile_id", reportedProfileIds)
      .in("provider_profile_id", reporterProfileIds),
  ]);

  const match = reporterAsSeeker?.[0] ?? reportedAsSeeker?.[0];
  if (!match) return null;

  const { data: messages } = await db
    .from("generic_messages")
    .select("id, sender_id, body, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: true });

  return {
    matchId: match.id,
    messages: (messages ?? []).map((m) => ({
      id: m.id as string,
      body: m.body as string,
      created_at: m.created_at as string,
      isReporter: m.sender_id === reporterUserId,
    })),
  };
}

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

  const conversation =
    (await legacyConversation(db, roleById, report.reporter_user_id, report.reported_user_id)) ??
    (await genericConversation(db, report.reporter_user_id, report.reported_user_id));

  if (!conversation) {
    return NextResponse.json({ matchId: null, messages: [] });
  }

  return NextResponse.json(conversation);
}
