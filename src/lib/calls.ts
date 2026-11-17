import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anyPushEnabled, pushTranslator, sendPush } from "@/lib/push";

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

/** Rings the callee's phones: opens the conversation, where the call screen shows. */
export function pushIncomingCall(calleeId: string, callId: string, matchId: string, callerName: string) {
  if (!anyPushEnabled()) return;
  after(() =>
    sendPush([calleeId], (locale) => {
      const t = pushTranslator(locale, "Push");
      return {
        title: callerName || t("someone"),
        body: t("incomingCall"),
        url: `/${locale}/messages?match=${matchId}`,
        tag: `call-${callId}`,
      };
    }),
  );
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
    await sendPush([call.callee_id], (locale) => {
      const t = pushTranslator(locale, "Push");
      return {
        title: callerProfile?.full_name || t("someone"),
        body: t("missedCall"),
        url: `/${locale}/messages?match=${call.match_id}`,
        tag: `call-${callId}`,
      };
    });
  });
}
