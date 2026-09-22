import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/voice-notes";

type Admin = ReturnType<typeof createAdminClient>;
type ConversationMessage = {
  id: string;
  body: string;
  created_at: string;
  isReporter: boolean;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
};

// Reports made from within a conversation record exactly which one
// (match_id/match_source, see /api/reports) -- used directly here when
// present. Older reports (or ones filed outside a conversation, e.g.
// against a feed post) have neither, so this falls back to searching for
// a mutual match between the two of them, on either the legacy
// nanny/parent track or a generic_matches one (nursing, tutoring, ...).
// That fallback is inherently ambiguous once the same two people share
// more than one active service relationship -- exactly what recording
// the match up front avoids. Goes through the service role throughout:
// this is a deliberate cross-user read for moderation, same pattern as
// the contact-reveal route, not something either party's own RLS should
// allow.

async function messagesForMatch(
  db: Admin,
  table: "messages" | "generic_messages",
  matchId: string,
  reporterUserId: string,
): Promise<ConversationMessage[]> {
  const { data: messages } = await db
    .from(table)
    .select("id, sender_id, body, audio_path, audio_duration_seconds, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });

  const audioPaths = (messages ?? []).map((m) => m.audio_path).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const { data: signed } = await db.storage.from("voice-notes").createSignedUrls(audioPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.signedUrl && !s.error) signedByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  return (messages ?? []).map((m) => ({
    id: m.id as string,
    body: m.body as string,
    created_at: m.created_at as string,
    isReporter: m.sender_id === reporterUserId,
    audioUrl: m.audio_path ? (signedByPath.get(m.audio_path) ?? null) : null,
    audioDurationSeconds: (m.audio_duration_seconds as number | null) ?? null,
  }));
}

async function directConversation(
  db: Admin,
  matchId: string,
  matchSource: string,
  reporterUserId: string,
): Promise<{ matchId: string; messages: ConversationMessage[] } | null> {
  const table = matchSource === "nanny" ? "matches" : "generic_matches";
  const { data: match } = await db.from(table).select("id").eq("id", matchId).maybeSingle();
  if (!match) return null;

  const messages = await messagesForMatch(db, matchSource === "nanny" ? "messages" : "generic_messages", matchId, reporterUserId);
  return { matchId, messages };
}

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

  const messages = await messagesForMatch(db, "messages", match.id, reporterUserId);
  return { matchId: match.id, messages };
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

  const messages = await messagesForMatch(db, "generic_messages", match.id, reporterUserId);
  return { matchId: match.id, messages };
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
    .select("reporter_user_id, reported_user_id, match_id, match_source")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let conversation =
    report.match_id && report.match_source
      ? await directConversation(db, report.match_id, report.match_source, report.reporter_user_id)
      : null;

  if (!conversation) {
    const { data: users } = await db
      .from("users")
      .select("id, role")
      .in("id", [report.reporter_user_id, report.reported_user_id]);

    const roleById = new Map((users ?? []).map((u) => [u.id, u.role]));

    conversation =
      (await legacyConversation(db, roleById, report.reporter_user_id, report.reported_user_id)) ??
      (await genericConversation(db, report.reporter_user_id, report.reported_user_id));
  }

  if (!conversation) {
    return NextResponse.json({ matchId: null, messages: [] });
  }

  return NextResponse.json(conversation);
}
