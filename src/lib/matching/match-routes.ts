import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  conversationUrl,
  isBlocked,
  matchNotificationPayload,
  resolveMatchAccess,
  type MatchAccess,
} from "@/lib/matching/match-access";
import { ratingAggregateForUser } from "@/lib/ratings";
import { sendEmail, newMessageEmail, activityEmailsEnabled } from "@/lib/email";
import { getPublicOrigin } from "@/lib/site-url";
import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  ALLOWED_AUDIO_TYPES,
  SIGNED_URL_TTL_SECONDS,
  VOICE_NOTE_PLACEHOLDER_BODY,
} from "@/lib/voice-notes";
import { notify, pushEnabled, pushTranslator, sendPush } from "@/lib/push";

/**
 * Route handlers for everything a party can do on one match, in any
 * category. /api/generic-matches/[id]/* re-exports these.
 */

type Ctx = { params: Promise<{ id: string }> };
type Handler = (request: Request, ctx: Ctx) => Promise<NextResponse>;
type Authed = { request: Request; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; access: MatchAccess };

const MESSAGE_PAGE_SIZE = 200;
const MESSAGE_COLUMNS = "id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at";
const CONVERSATION_CLOSED = "This conversation is closed";

// Raised by before_generic_message_insert (20261005000001_open_messaging.sql).
const SEND_REFUSALS: Record<string, { status: number; error: string }> = {
  new_conversation_limit: { status: 429, error: "You've started the maximum number of new conversations for today" },
  profile_not_available: { status: 409, error: "This profile isn't available to message right now" },
  conversation_blocked: { status: 403, error: CONVERSATION_CLOSED },
};

/** The response for a refused message insert, using the trigger's reason when there is one. */
function sendRefused(error: { message: string }) {
  const code = Object.keys(SEND_REFUSALS).find((c) => error.message.includes(c));
  if (!code) return NextResponse.json({ error: error.message }, { status: 400 });
  const { status, error: text } = SEND_REFUSALS[code]!;
  return NextResponse.json({ error: text, code }, { status });
}

/** Authenticates the caller and resolves their side of the match before running `fn`. */
function withAccess(fn: (ctx: Authed) => Promise<NextResponse>): Handler {
  return async (request, { params }) => {
    const { id } = await params;
    const supabase = await createClient();
    const user = await requireActiveUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const access = await resolveMatchAccess(supabase, id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    return fn({ request, supabase, userId: user.id, access });
  };
}

// ---------------------------------------------------------------- messages

export const messagesGet: Handler = withAccess(async ({ request, supabase, access }) => {
  // Fetched newest-first and reversed, rather than oldest-first with no
  // bound -- PostgREST's max_rows cap (supabase/config.toml) otherwise
  // silently truncates a long thread to its OLDEST rows, hiding whatever
  // conversation is actually happening now. `before` pages further back
  // in history from there.
  const before = new URL(request.url).searchParams.get("before");

  let query = supabase
    .from("generic_messages")
    .select(MESSAGE_COLUMNS)
    .eq("match_id", access.id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const page = (data ?? []).slice().reverse();

  // Voice notes live in a private bucket with no select policy -- only the
  // service role can sign a URL for one, which is exactly the point: a
  // client only ever gets a playable link by going through this
  // match-participancy check first.
  const audioPaths = page.map((m) => m.audio_path).filter((p): p is string => !!p);
  const signedByPath = new Map<string, string>();
  if (audioPaths.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage.from("voice-notes").createSignedUrls(audioPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.signedUrl && !s.error) signedByPath.set(s.path ?? "", s.signedUrl);
    }
  }

  const messages = page.map((m) => ({
    ...m,
    audioUrl: m.audio_path ? (signedByPath.get(m.audio_path) ?? null) : null,
  }));

  return NextResponse.json({ messages, hasMore: (data ?? []).length === MESSAGE_PAGE_SIZE });
});

const messageBodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const messagesPost: Handler = withAccess(async ({ request, supabase, userId, access }) => {
  if (isBlocked(access.status)) {
    return NextResponse.json({ error: CONVERSATION_CLOSED, code: "conversation_blocked" }, { status: 403 });
  }

  const parsed = messageBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("generic_messages")
    .insert({ match_id: access.id, sender_id: userId, body: parsed.data.body })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    return sendRefused(error);
  }

  const snippet = parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body;
  await emailRecipientOnFirstUnread(request, access, snippet);
  pushNewMessage(access, snippet);

  return NextResponse.json({ message: data }, { status: 201 });
});

export const messagesAudioPost: Handler = withAccess(async ({ request, supabase, userId, access }) => {
  if (isBlocked(access.status)) {
    return NextResponse.json({ error: CONVERSATION_CLOSED, code: "conversation_blocked" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const durationRaw = formData?.get("durationSeconds");
  const durationSeconds = Math.min(MAX_RECORDING_SECONDS, Math.max(0, Number(durationRaw) || 0));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  // Defensive: the client already strips any codec suffix (e.g.
  // "audio/webm;codecs=opus" -> "audio/webm") before it ever gets here, but
  // don't depend on every future caller doing that.
  const baseType = file.type.split(";")[0] ?? file.type;
  if (!ALLOWED_AUDIO_TYPES.includes(baseType)) {
    return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Voice note too long (max 5MB)" }, { status: 400 });
  }

  // The voice-notes bucket's RLS is keyed by "first path segment is your
  // own user id" -- nothing about it is specific to which table the
  // message ends up in.
  const ext = file.type.split("/")[1]?.split(";")[0] ?? "webm";
  const path = `${userId}/${access.id}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("voice-notes").upload(path, file, {
    contentType: baseType,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: message, error } = await supabase
    .from("generic_messages")
    .insert({
      match_id: access.id,
      sender_id: userId,
      body: VOICE_NOTE_PLACEHOLDER_BODY,
      audio_path: path,
      audio_duration_seconds: Math.round(durationSeconds),
    })
    .select(MESSAGE_COLUMNS)
    .single();

  const admin = createAdminClient();
  if (error) {
    // The upload already happened -- don't leave an orphaned voice note
    // behind a refused message (e.g. the daily new-conversation limit).
    await admin.storage.from("voice-notes").remove([path]).catch(() => {});
    return sendRefused(error);
  }

  const { data: signed } = await admin.storage.from("voice-notes").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  await emailRecipientOnFirstUnread(request, access, VOICE_NOTE_PLACEHOLDER_BODY);
  pushNewMessage(access, null);

  return NextResponse.json({ message: { ...message, audioUrl: signed?.signedUrl ?? null } }, { status: 201 });
});

export const messagesMarkRead: Handler = withAccess(async ({ supabase, userId, access }) => {
  // RLS (generic_messages_mark_read) already restricts this to the recipient's own inbound messages and only the
  // read_at column.
  const { error } = await supabase
    .from("generic_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("match_id", access.id)
    .neq("sender_id", userId)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});

/**
 * Email the recipient -- but only for the first still-unread message in
 * the thread, so an active back-and-forth doesn't send an email per line.
 * The counter re-arms once they read (which clears read_at on all of the
 * sender's messages). Best-effort: a mail failure never fails the send.
 */
/**
 * Pushes every message (unlike the email, which only goes out for the first
 * unread one) -- one notification per conversation, replaced as new messages
 * arrive. `preview` null means a voice note. Runs after the response.
 */
function pushNewMessage(access: MatchAccess, preview: string | null) {
  if (!pushEnabled()) return;
  after(async () => {
    const admin = createAdminClient();
    const { data: sender } = await admin.from("generic_profiles").select("full_name").eq("id", access.myProfileId).single();
    await sendPush([access.otherUserId], (locale) => {
      const t = pushTranslator(locale, "Push");
      return {
        title: sender?.full_name ?? t("someone"),
        body: preview ?? t("voiceMessage"),
        url: `/${locale}/messages?match=${access.id}`,
        tag: `message-${access.id}`,
      };
    });
  });
}

async function emailRecipientOnFirstUnread(request: Request, access: MatchAccess, snippet: string) {
  if (!activityEmailsEnabled()) return;

  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("generic_messages")
      .select("id", { count: "exact", head: true })
      .eq("match_id", access.id)
      .eq("sender_id", access.myUserId)
      .is("read_at", null);

    if ((count ?? 0) !== 1) return;

    const [{ data: recipient }, { data: senderProfile }] = await Promise.all([
      admin.from("users").select("email, preferred_language").eq("id", access.otherUserId).single(),
      admin.from("generic_profiles").select("full_name").eq("id", access.myProfileId).single(),
    ]);

    if (!recipient?.email) return;

    const lang = recipient.preferred_language as "en" | "ar" | "fr" | null;
    const locale = lang === "ar" ? "ar" : "en";
    const { subject, html } = newMessageEmail(
      lang,
      senderProfile?.full_name ?? "Someone",
      snippet,
      conversationUrl(getPublicOrigin(request), locale, access.id),
    );
    await sendEmail(recipient.email, subject, html);
  } catch (err) {
    console.error("[messages] new-message email failed:", err);
  }
}

// ------------------------------------------------------------------- block

/**
 * "Not interested" on a match card, or Block in a conversation: no new
 * messages in either direction from then on (generic_messages_insert and
 * before_generic_message_insert both refuse a declined_by_* match).
 */
export const declinePost: Handler = withAccess(async ({ access }) => {
  if (isBlocked(access.status)) {
    return NextResponse.json({ error: CONVERSATION_CLOSED }, { status: 409 });
  }

  const admin = createAdminClient();
  // Compare-and-swap on the status this decision was based on, so a block
  // racing another change on the same row errors out cleanly instead of
  // silently overwriting it.
  const { data: updated, error } = await admin
    .from("generic_matches")
    .update({ status: `declined_by_${access.side}`, responded_at: new Date().toISOString() })
    .eq("id", access.id)
    .eq("status", access.status)
    .select("id, status")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "This match just changed — please refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ match: updated });
});

// ------------------------------------------------------------------ rating

/**
 * Rating needs a real exchange, not just a match card: at least one
 * message from each side (generic_ratings_insert enforces the same).
 */
async function bothHaveWritten(access: MatchAccess) {
  const admin = createAdminClient();
  const sent = (senderId: string) =>
    admin.from("generic_messages").select("id", { count: "exact", head: true }).eq("match_id", access.id).eq("sender_id", senderId);
  const [{ count: mine }, { count: theirs }] = await Promise.all([sent(access.myUserId), sent(access.otherUserId)]);
  return (mine ?? 0) > 0 && (theirs ?? 0) > 0;
}

const ratingBodySchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const ratingGet: Handler = withAccess(async ({ supabase, userId, access }) => {
  const { data: mine } = await supabase
    .from("generic_ratings")
    .select("score, comment, updated_at")
    .eq("match_id", access.id)
    .eq("rater_user_id", userId)
    .maybeSingle();

  const [counterpart, canRate] = await Promise.all([ratingAggregateForUser(access.otherUserId), bothHaveWritten(access)]);

  return NextResponse.json({
    mine: mine ?? null,
    counterpart,
    canRate,
  });
});

export const ratingPut: Handler = withAccess(async ({ request, supabase, userId, access }) => {
  const parsed = ratingBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await bothHaveWritten(access))) {
    return NextResponse.json({ error: "You can rate each other once you've both sent a message" }, { status: 403 });
  }

  const { data: saved, error } = await supabase
    .from("generic_ratings")
    .upsert(
      {
        match_id: access.id,
        rater_user_id: userId,
        ratee_user_id: access.otherUserId,
        score: parsed.data.score,
        comment: parsed.data.comment ?? null,
      },
      { onConflict: "match_id,rater_user_id" },
    )
    .select("score, comment, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notifications are server-written only (service role). Best-effort.
  await notify({
    user_id: access.otherUserId,
    type: "rating_received",
    payload: { ...matchNotificationPayload(access), score: parsed.data.score },
  });

  const counterpart = await ratingAggregateForUser(access.otherUserId);

  return NextResponse.json({ mine: saved, counterpart });
});
