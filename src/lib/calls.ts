import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anyPushEnabled, pushTranslator, sendPush } from "@/lib/push";
import { apnsEnabled, fcmEnabled, sendApnsVoip, sendFcmData } from "@/lib/native-push";

/**
 * In-app voice calls (see 20261117000001_calls.sql). The audio goes peer to
 * peer over WebRTC, set up through a Supabase Realtime broadcast channel
 * per call (src/components/calls/call-provider.tsx); this side keeps the
 * call's row, decides who may call whom, and rings the other side's phones.
 */

/** How long a call rings before it counts as missed. */
export const RING_SECONDS = 45;
/** Calls one person may start in CALL_WINDOW_MINUTES: enough for redials, not for harassment. */
const MAX_CALLS_PER_WINDOW = 12;
const CALL_WINDOW_MINUTES = 10;

export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined" | "busy" | "failed";
export const OPEN_STATUSES: CallStatus[] = ["ringing", "active"];

type Admin = ReturnType<typeof createAdminClient>;

export function ringCutoff() {
  return new Date(Date.now() - RING_SECONDS * 1000).toISOString();
}

/**
 * Calls are only between people who already talk: a message in the
 * conversation, from either side, or an order that opened it.
 */
export async function callAllowed(db: Admin, matchId: string) {
  const [{ count: messages }, { count: orders }] = await Promise.all([
    db.from("generic_messages").select("id", { count: "exact", head: true }).eq("match_id", matchId),
    db.from("errand_orders").select("id", { count: "exact", head: true }).eq("generic_match_id", matchId),
  ]);
  return (messages ?? 0) > 0 || (orders ?? 0) > 0;
}

export async function tooManyCalls(db: Admin, callerId: string) {
  const since = new Date(Date.now() - CALL_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await db.from("calls").select("id", { count: "exact", head: true }).eq("caller_id", callerId).gte("created_at", since);
  return (count ?? 0) >= MAX_CALLS_PER_WINDOW;
}

/**
 * Closes anything this person left open: a ring nobody answered in time
 * becomes missed, and a call they're starting a new one over is over.
 */
export async function closeLeftoverCalls(db: Admin, userId: string) {
  const now = new Date().toISOString();
  await Promise.all([
    db
      .from("calls")
      .update({ status: "missed", ended_at: now })
      .eq("status", "ringing")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .lt("created_at", ringCutoff()),
    db.from("calls").update({ status: "missed", ended_at: now }).eq("status", "ringing").eq("caller_id", userId),
    db.from("calls").update({ status: "ended", ended_at: now }).eq("status", "active").eq("caller_id", userId),
  ]);
}

/** Name and photo of someone's side of a conversation. */
export async function profileCard(db: Admin, profileId: string) {
  const { data } = await db.from("generic_profiles").select("full_name, profile_photo_url").eq("id", profileId).maybeSingle();
  return { name: data?.full_name ?? "", photoUrl: data?.profile_photo_url ?? null };
}

// -- ringing phones ------------------------------------------------------------

/**
 * Proof, carried in a ring, that the phone may decline or end this call on
 * its own (iOS CallKit's Decline, Android's notification button) -- the
 * native side has no session cookie to call the API with.
 */
export function callActionToken(callId: string, calleeId: string) {
  const key = process.env.CALL_ACTION_SECRET || `calls:${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  return createHmac("sha256", key).update(`${callId}:${calleeId}`).digest("base64url");
}

export function validCallActionToken(callId: string, calleeId: string, token: string) {
  const expected = Buffer.from(callActionToken(callId, calleeId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type RingRow = { token: string; platform: string; voip_token: string | null; rings_calls: boolean };

/** The callee's app installs that ring for calls themselves (iPhone CallKit, Android call screen). */
export async function ringingDevices(calleeId: string): Promise<RingRow[]> {
  const { data, error } = await createAdminClient()
    .from("native_push_tokens")
    .select("token, platform, voip_token, rings_calls")
    .eq("user_id", calleeId);
  // Before 20261118000001 the columns don't exist: no device rings, every one gets the notification.
  if (error) return [];
  return (data ?? []).filter((r) => (r.platform === "ios" && r.voip_token) || (r.platform === "android" && r.rings_calls));
}

async function ring(rows: RingRow[], data: Record<string, string>, ttlSeconds: number) {
  const ios = rows.filter((r) => r.platform === "ios" && r.voip_token).map((r) => r.voip_token!);
  const android = rows.filter((r) => r.platform === "android").map((r) => r.token);
  await Promise.all([
    ios.length && apnsEnabled() ? sendApnsVoip(ios, data, ttlSeconds) : null,
    android.length && fcmEnabled() ? sendFcmData(android, data, ttlSeconds) : null,
  ]);
}

/**
 * Rings the callee: phones whose app rings for calls get the incoming-call
 * screen; every other device (browsers, older apps) a notification that
 * opens the conversation, where the call screen shows.
 */
export function pushIncomingCall(calleeId: string, callId: string, matchId: string, callerName: string) {
  if (!anyPushEnabled()) return;
  after(async () => {
    const rows = await ringingDevices(calleeId);
    await Promise.all([
      ring(
        rows,
        {
          kind: "incoming",
          callId,
          matchId,
          name: callerName,
          actionToken: callActionToken(callId, calleeId),
          url: `/messages?match=${matchId}`,
        },
        RING_SECONDS,
      ),
      sendPush(
        [calleeId],
        (locale) => {
          const t = pushTranslator(locale, "Push");
          return {
            title: callerName || t("someone"),
            body: t("incomingCall"),
            url: `/${locale}/messages?match=${matchId}`,
            tag: `call-${callId}`,
          };
        },
        { skipNativeTokens: new Set(rows.map((r) => r.token)) },
      ),
    ]);
  });
}

/**
 * Stops the ringing on the callee's phones: the call was answered (the
 * phone that answered ignores this), declined, or the caller gave up.
 */
export function cancelRinging(callId: string, calleeId: string, reason: "answered" | "declined" | "ended") {
  if (!apnsEnabled() && !fcmEnabled()) return;
  after(async () => {
    const rows = await ringingDevices(calleeId);
    if (rows.length) await ring(rows, { kind: "cancel", callId, reason }, 60);
  });
}

/**
 * Android apps from 1.6 show the missed-call notification themselves, with
 * Call back and Message buttons (MissedCalls.java): they get it as data.
 */
async function missedCallPhones(calleeId: string) {
  if (!fcmEnabled()) return [];
  const { data, error } = await createAdminClient()
    .from("native_push_tokens")
    .select("token, locale")
    .eq("user_id", calleeId)
    .eq("platform", "android")
    .eq("missed_call_actions", true);
  return error ? [] : (data ?? []);
}

/** Replaces the ringing notification with a missed-call one. */
export function pushMissedCall(callId: string) {
  if (!anyPushEnabled()) return;
  after(async () => {
    const db = createAdminClient();
    const { data: call } = await db.from("calls").select("match_id, caller_id, callee_id").eq("id", callId).maybeSingle();
    if (!call) return;
    const { data: match } = await db.from("generic_matches").select("seeker_profile_id, provider_profile_id").eq("id", call.match_id).maybeSingle();
    const { data: callerProfile } = match
      ? await db
          .from("generic_profiles")
          .select("full_name")
          .in("id", [match.seeker_profile_id, match.provider_profile_id])
          .eq("user_id", call.caller_id)
          .maybeSingle()
      : { data: null };
    const phones = await missedCallPhones(call.callee_id);
    await Promise.all([
      ...(["en", "ar"] as const).map((locale) => {
        const tokens = phones.filter((p) => (p.locale === "ar" ? "ar" : "en") === locale).map((p) => p.token);
        if (tokens.length === 0) return null;
        const t = pushTranslator(locale, "Push");
        const tc = pushTranslator(locale, "Calls");
        return sendFcmData(
          tokens,
          {
            kind: "missed",
            callId,
            matchId: call.match_id,
            name: callerProfile?.full_name ?? "",
            title: callerProfile?.full_name || t("someone"),
            body: t("missedCall"),
            callBack: tc("callBack"),
            message: tc("message"),
          },
          24 * 60 * 60,
        );
      }),
      sendPush(
        [call.callee_id],
        (locale) => {
          const t = pushTranslator(locale, "Push");
          return {
            title: callerProfile?.full_name || t("someone"),
            body: t("missedCall"),
            url: `/${locale}/messages?tab=calls`,
            tag: `call-${callId}`,
          };
        },
        { skipNativeTokens: new Set(phones.map((p) => p.token)) },
      ),
    ]);
  });
}

/**
 * Whether this person takes calls in this conversation: off for everyone
 * (Settings), or just here (the conversation's menu).
 */
export async function takesCalls(db: Admin, userId: string, matchId: string) {
  const [{ data: user }, { count }] = await Promise.all([
    db.from("users").select("accepts_calls").eq("id", userId).maybeSingle(),
    db.from("call_mutes").select("match_id", { count: "exact", head: true }).eq("user_id", userId).eq("match_id", matchId),
  ]);
  return user?.accepts_calls !== false && (count ?? 0) === 0;
}

/** Statuses that count as a missed call for the person called. */
export const MISSED_STATUSES: CallStatus[] = ["missed", "busy"];

/** The callee has looked at these missed calls: they stop counting on the badge. */
export async function markMissedCallsSeen(db: Admin, userId: string, matchId?: string) {
  let query = db
    .from("calls")
    .update({ seen_at: new Date().toISOString() })
    .eq("callee_id", userId)
    .is("seen_at", null)
    .in("status", MISSED_STATUSES);
  if (matchId) query = query.eq("match_id", matchId);
  await query;
}

/** Unseen missed calls, for the Messages badge. */
export async function unseenMissedCalls(db: Admin, userId: string) {
  const { count } = await db
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("callee_id", userId)
    .is("seen_at", null)
    .in("status", MISSED_STATUSES);
  return count ?? 0;
}

/**
 * Rings nobody ended: the caller's app closed or lost its connection while
 * ringing, so it never said "no answer". Run by the cron every 30 s; a
 * little after the ring would have ended, so the caller's own timer
 * normally gets there first. Each call is moved once (the update only
 * matches a ringing row), so the missed-call push goes out once.
 */
export async function sweepStaleCalls(db: Admin) {
  const cutoff = new Date(Date.now() - (RING_SECONDS + 15) * 1000).toISOString();
  const { data: stale } = await db
    .from("calls")
    .select("id, callee_id")
    .eq("status", "ringing")
    .lt("created_at", cutoff)
    .limit(100);
  let moved = 0;
  for (const call of stale ?? []) {
    const { data } = await db
      .from("calls")
      .update({ status: "missed", ended_at: new Date().toISOString() })
      .eq("id", call.id)
      .eq("status", "ringing")
      .select("id")
      .maybeSingle();
    if (!data) continue;
    moved++;
    cancelRinging(call.id, call.callee_id, "ended");
    pushMissedCall(call.id);
  }
  return moved;
}
