import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/voice-notes";
import { verifyMatchParticipants } from "@/lib/reports";

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
// (match_id, see /api/reports) -- used directly here when present. Older
// reports (or ones filed outside a conversation, e.g. against a feed post)
// don't, so this falls back to searching for a mutual match between the
// two of them.
// That fallback is inherently ambiguous once the same two people share
// more than one active service relationship -- exactly what recording
// the match up front avoids. Goes through the service role throughout:
// this is a deliberate cross-user read for moderation, same pattern as
// the contact-reveal route, not something either party's own RLS should
// allow.

// Newest-first page, reversed for display. Oldest-first with no bound
// silently truncated a long thread to its OLDEST rows under PostgREST's
// max_rows cap (supabase/config.toml) -- exactly hiding a recent incident.
// `before` pages further back; hasOlder tells the admin UI there's more,
// so a partial window is never presented as the whole conversation.
const ADMIN_MESSAGE_PAGE_SIZE = 200;

type ConversationPage = { messages: ConversationMessage[]; hasOlder: boolean };

async function messagesForMatch(
  db: Admin,
  matchId: string,
  reporterUserId: string,
  before: string | null,
): Promise<ConversationPage> {
  let query = db
    .from("generic_messages")
    .select("id, sender_id, body, audio_path, audio_duration_seconds, created_at")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(ADMIN_MESSAGE_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);

  const { data } = await query;
  const rows = data ?? [];
  const hasOlder = rows.length > ADMIN_MESSAGE_PAGE_SIZE;
  const messages = rows.slice(0, ADMIN_MESSAGE_PAGE_SIZE).reverse();

  const audioPaths = messages.map((m) => m.audio_path).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const { data: signed } = await db.storage.from("voice-notes").createSignedUrls(audioPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.signedUrl && !s.error) signedByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  return {
    hasOlder,
    messages: messages.map((m) => ({
      id: m.id as string,
      body: m.body as string,
      created_at: m.created_at as string,
      isReporter: m.sender_id === reporterUserId,
      audioUrl: m.audio_path ? (signedByPath.get(m.audio_path) ?? null) : null,
      audioDurationSeconds: (m.audio_duration_seconds as number | null) ?? null,
    })),
  };
}

async function directConversation(
  db: Admin,
  matchId: string,
  reporterUserId: string,
  reportedUserId: string,
  before: string | null,
): Promise<({ matchId: string } & ConversationPage) | null> {
  // report_match_participants_valid enforces this at insert time, but
  // re-verify independently here too rather than trusting a stored
  // match_id outright -- a report inserted before that check existed, or
  // any future insert path that forgets it, must never surface an
  // unrelated couple's conversation as evidence against the reported user.
  if (!(await verifyMatchParticipants(db, matchId, reporterUserId, reportedUserId))) return null;

  const page = await messagesForMatch(db, matchId, reporterUserId, before);
  return { matchId, ...page };
}

async function mutualConversation(
  db: Admin,
  reporterUserId: string,
  reportedUserId: string,
  before: string | null,
): Promise<({ matchId: string } & ConversationPage) | null> {
  const { data: profiles } = await db
    .from("generic_profiles")
    .select("id, user_id")
    .in("user_id", [reporterUserId, reportedUserId]);

  const reporterProfileIds = (profiles ?? []).filter((p) => p.user_id === reporterUserId).map((p) => p.id);
  const reportedProfileIds = (profiles ?? []).filter((p) => p.user_id === reportedUserId).map((p) => p.id);
  if (reporterProfileIds.length === 0 || reportedProfileIds.length === 0) return null;

  // Two plain queries (one per direction) rather than an OR'd IN-list
  // string -- keeps this unambiguous rather than hand-building a PostgREST
  // filter expression.
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

  const page = await messagesForMatch(db, match.id, reporterUserId, before);
  return { matchId: match.id, ...page };
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
    .select("reporter_user_id, reported_user_id, match_id")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const before = new URL(request.url).searchParams.get("before");

  // Either party may since have been deleted (reports.*_user_id are ON
  // DELETE SET NULL) -- their messages went with them, so there's nothing
  // left to show.
  const reporterUserId = report.reporter_user_id as string | null;
  const reportedUserId = report.reported_user_id as string | null;
  if (!reporterUserId || !reportedUserId) {
    return NextResponse.json({ matchId: null, messages: [], hasOlder: false });
  }

  const conversation =
    (report.match_id ? await directConversation(db, report.match_id, reporterUserId, reportedUserId, before) : null) ??
    (await mutualConversation(db, reporterUserId, reportedUserId, before));

  if (!conversation) {
    return NextResponse.json({ matchId: null, messages: [], hasOlder: false });
  }

  return NextResponse.json(conversation);
}
