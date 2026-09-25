import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MATCH_SOURCES,
  conversationUrl,
  effectiveStatus,
  matchNotificationPayload,
  profileTableFor,
  resolveMatchAccess,
  type MatchAccess,
  type MatchSource,
} from "@/lib/matching/match-access";
import { applyInterest } from "@/lib/matching/apply-interest";
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

/**
 * Route handlers for everything a party can do on one match, written once
 * for both match stores. /api/matches/[id]/* (nanny/parent) and
 * /api/generic-matches/[id]/* (nursing, tutoring, ...) are thin wrappers
 * that pick the MatchSource -- so a fix or feature here lands in every
 * category at once instead of drifting between two copies.
 */

type Ctx = { params: Promise<{ id: string }> };
type Handler = (request: Request, ctx: Ctx) => Promise<NextResponse>;
type Authed = { request: Request; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; access: MatchAccess };

const MESSAGE_PAGE_SIZE = 200;
const MESSAGE_COLUMNS = "id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at";
const CHAT_LOCKED = "Chat unlocks once both sides say yes";

/** Authenticates the caller and resolves their side of the match before running `fn`. */
function withAccess(source: MatchSource, fn: (ctx: Authed) => Promise<NextResponse>): Handler {
  return async (request, { params }) => {
    const { id } = await params;
    const supabase = await createClient();
    const user = await requireActiveUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const access = await resolveMatchAccess(supabase, source, id, user.id);
    if (!access) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    return fn({ request, supabase, userId: user.id, access });
  };
}

// ---------------------------------------------------------------- messages

export function messagesGet(source: MatchSource): Handler {
  return withAccess(source, async ({ request, supabase, access }) => {
    if (access.status !== "mutual") {
      return NextResponse.json({ error: CHAT_LOCKED }, { status: 403 });
    }

    // Fetched newest-first and reversed, rather than oldest-first with no
    // bound -- PostgREST's max_rows cap (supabase/config.toml) otherwise
    // silently truncates a long thread to its OLDEST rows, hiding whatever
    // conversation is actually happening now. `before` pages further back
    // in history from there.
    const before = new URL(request.url).searchParams.get("before");

    let query = supabase
      .from(MATCH_SOURCES[source].messagesTable)
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
}

const messageBodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export function messagesPost(source: MatchSource): Handler {
  return withAccess(source, async ({ request, supabase, userId, access }) => {
    if (access.status !== "mutual") {
      return NextResponse.json({ error: CHAT_LOCKED }, { status: 403 });
    }

    const parsed = messageBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(MATCH_SOURCES[source].messagesTable)
      .insert({ match_id: access.id, sender_id: userId, body: parsed.data.body })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const snippet = parsed.data.body.length > 140 ? `${parsed.data.body.slice(0, 140)}…` : parsed.data.body;
    await emailRecipientOnFirstUnread(request, access, snippet);

    return NextResponse.json({ message: data }, { status: 201 });
  });
}

export function messagesAudioPost(source: MatchSource): Handler {
  return withAccess(source, async ({ request, supabase, userId, access }) => {
    if (access.status !== "mutual") {
      return NextResponse.json({ error: CHAT_LOCKED }, { status: 403 });
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
      .from(MATCH_SOURCES[source].messagesTable)
      .insert({
        match_id: access.id,
        sender_id: userId,
        body: VOICE_NOTE_PLACEHOLDER_BODY,
        audio_path: path,
        audio_duration_seconds: Math.round(durationSeconds),
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: signed } = await admin.storage.from("voice-notes").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    await emailRecipientOnFirstUnread(request, access, VOICE_NOTE_PLACEHOLDER_BODY);

    return NextResponse.json({ message: { ...message, audioUrl: signed?.signedUrl ?? null } }, { status: 201 });
  });
}

export function messagesMarkRead(source: MatchSource): Handler {
  return withAccess(source, async ({ supabase, userId, access }) => {
    // RLS (messages_mark_read / generic_messages_mark_read) already
    // restricts this to the recipient's own inbound messages and only the
    // read_at column.
    const { error } = await supabase
      .from(MATCH_SOURCES[source].messagesTable)
      .update({ read_at: new Date().toISOString() })
      .eq("match_id", access.id)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  });
}

/**
 * Email the recipient -- but only for the first still-unread message in
 * the thread, so an active back-and-forth doesn't send an email per line.
 * The counter re-arms once they read (which clears read_at on all of the
 * sender's messages). Best-effort: a mail failure never fails the send.
 */
async function emailRecipientOnFirstUnread(request: Request, access: MatchAccess, snippet: string) {
  if (!activityEmailsEnabled()) return;

  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from(MATCH_SOURCES[access.source].messagesTable)
      .select("id", { count: "exact", head: true })
      .eq("match_id", access.id)
      .eq("sender_id", access.myUserId)
      .is("read_at", null);

    if ((count ?? 0) !== 1) return;

    const [{ data: recipient }, { data: senderProfile }] = await Promise.all([
      admin.from("users").select("email, preferred_language").eq("id", access.otherUserId).single(),
      admin.from(profileTableFor(access.source, access.side)).select("full_name").eq("id", access.myProfileId).single(),
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
    console.error(`[${access.source} messages] new-message email failed:`, err);
  }
}

// ----------------------------------------------------------------- contact

export function contactGet(source: MatchSource): Handler {
  return withAccess(source, async ({ access }) => {
    if (access.status !== "mutual") {
      return NextResponse.json({ error: "Contact details unlock once both sides say yes" }, { status: 403 });
    }

    // users RLS only allows self-reads -- the mutual-status check above is the
    // authorization for this cross-user read, so it goes through the service role.
    const admin = createAdminClient();
    const { data: counterpart } = await admin
      .from("users")
      .select("contact_phone, email")
      .eq("id", access.otherUserId)
      .single();

    const phone = counterpart?.contact_phone ?? null;
    const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;

    return NextResponse.json({ phone, email: counterpart?.email ?? null, whatsappUrl });
  });
}

// ---------------------------------------------------- interest and decline

export function interestPost(source: MatchSource): Handler {
  return withAccess(source, async ({ request, access }) => applyInterest(request, access));
}

export function declinePost(source: MatchSource): Handler {
  return withAccess(source, async ({ access }) => {
    const status = effectiveStatus(access);
    if (status === "mutual" || status.startsWith("declined_by_")) {
      return NextResponse.json({ error: "This match can no longer be declined" }, { status: 409 });
    }

    const admin = createAdminClient();
    // Compare-and-swap on the raw status this decision was based on -- same
    // guard as applyInterest, and the same reason: without it, a decline
    // racing against a concurrent interest/accept on the same row could
    // silently clobber the other side's transition instead of one erroring
    // out with a clean "this changed, refresh" response.
    const { data: updated, error } = await admin
      .from(MATCH_SOURCES[source].matchesTable)
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
}

// ------------------------------------------------------------------ rating

const ratingBodySchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export function ratingGet(source: MatchSource): Handler {
  return withAccess(source, async ({ supabase, userId, access }) => {
    const { data: mine } = await supabase
      .from(MATCH_SOURCES[source].ratingsTable)
      .select("score, comment, updated_at")
      .eq("match_id", access.id)
      .eq("rater_user_id", userId)
      .maybeSingle();

    const counterpart = await ratingAggregateForUser(access.otherUserId);

    return NextResponse.json({
      mine: mine ?? null,
      counterpart,
      canRate: effectiveStatus(access) === "mutual",
    });
  });
}

export function ratingPut(source: MatchSource): Handler {
  return withAccess(source, async ({ request, supabase, userId, access }) => {
    const parsed = ratingBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (effectiveStatus(access) !== "mutual") {
      return NextResponse.json({ error: "You can rate each other once you've matched" }, { status: 403 });
    }

    const { data: saved, error } = await supabase
      .from(MATCH_SOURCES[source].ratingsTable)
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
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: access.otherUserId,
      type: "rating_received",
      payload: { ...matchNotificationPayload(access), score: parsed.data.score },
    });

    const counterpart = await ratingAggregateForUser(access.otherUserId);

    return NextResponse.json({ mine: saved, counterpart });
  });
}
