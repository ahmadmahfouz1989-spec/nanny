import { createAdminClient } from "@/lib/supabase/admin";
import { anyPushEnabled, sendPushCounted } from "@/lib/push";

/**
 * Announcements from ouiKnow to providers. The recipient rows are the source
 * of truth: one per person, so someone with several provider profiles gets
 * one copy, and a person a device already accepted is never sent to again.
 */

type Db = ReturnType<typeof createAdminClient>;

export type Audience = { audience: "all_providers" } | { audience: "category"; categoryId: string } | { audience: "selected"; userIds: string[] };

const PAGE = 1000;
const SEND_BATCH = 100;
// A send still marked "sending" this long after it started has died with
// the server (a restart mid-send), so it may be tried again.
const STALE_SENDING_MS = 5 * 60 * 1000;
const PUSH_BODY_LENGTH = 178;

/**
 * Everyone an audience reaches, each person once. "All" and a category mean
 * approved providers; picking someone by hand also reaches a provider still
 * in review. Suspended and deleted accounts are never included.
 */
export async function resolveRecipients(db: Db, target: Audience): Promise<string[]> {
  const users = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    let query = db
      .from("generic_profiles")
      .select("user_id, users!generic_profiles_user_id_fkey!inner(status)")
      .eq("role", "provider")
      .neq("status", "draft")
      .eq("users.status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (target.audience === "selected") {
      query = query.neq("moderation_status", "rejected").in("user_id", target.userIds);
    } else {
      query = query.eq("moderation_status", "approved");
      if (target.audience === "category") query = query.eq("category_id", target.categoryId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`broadcast recipients: ${error.message}`);
    for (const row of data ?? []) users.add(row.user_id);
    if ((data?.length ?? 0) < PAGE) break;
  }
  return [...users];
}

function excerpt(text: string, length: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length - 1).trimEnd()}…`;
}

/**
 * Saves the message, its recipients and each person's bell entry. Nothing is
 * pushed here: deliverBroadcast does that once the admin has their answer.
 * The same requestId returns the first message instead of making another.
 */
export async function createBroadcast(
  db: Db,
  input: { requestId: string; createdBy: string; title: string; body: string; target: Audience },
): Promise<{ id: string; recipients: number; created: boolean }> {
  const { data: earlier } = await db.from("broadcasts").select("id").eq("request_id", input.requestId).maybeSingle();
  if (earlier) return { id: earlier.id, recipients: await countRecipients(db, earlier.id), created: false };

  const recipients = await resolveRecipients(db, input.target);
  if (recipients.length === 0) return { id: "", recipients: 0, created: false };

  const { data: broadcast, error } = await db
    .from("broadcasts")
    .insert({
      request_id: input.requestId,
      created_by: input.createdBy,
      title: input.title,
      body: input.body,
      audience: input.target.audience,
      category_id: input.target.audience === "category" ? input.target.categoryId : null,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Two presses at the same moment: the other one won.
    const { data: winner } = await db.from("broadcasts").select("id").eq("request_id", input.requestId).single();
    return { id: winner!.id, recipients: await countRecipients(db, winner!.id), created: false };
  }
  if (error || !broadcast) throw new Error(`broadcast: ${error?.message}`);

  try {
    for (let i = 0; i < recipients.length; i += PAGE) {
      const batch = recipients.slice(i, i + PAGE);
      const rows = await db.from("broadcast_recipients").insert(batch.map((user_id) => ({ broadcast_id: broadcast.id, user_id })));
      if (rows.error) throw new Error(rows.error.message);
      const bell = await db.from("notifications").insert(
        batch.map((user_id) => ({
          user_id,
          type: "announcement",
          payload: { broadcast_id: broadcast.id, title: input.title, notes: excerpt(input.body, 140) },
        })),
      );
      if (bell.error) throw new Error(bell.error.message);
    }
  } catch (err) {
    // All or nothing: never a half-saved message with no way to send the rest.
    await db.from("notifications").delete().eq("type", "announcement").eq("payload->>broadcast_id", broadcast.id);
    await db.from("broadcasts").delete().eq("id", broadcast.id);
    throw err;
  }
  return { id: broadcast.id, recipients: recipients.length, created: true };
}

async function countRecipients(db: Db, broadcastId: string) {
  const { count } = await db.from("broadcast_recipients").select("user_id", { count: "exact", head: true }).eq("broadcast_id", broadcastId);
  return count ?? 0;
}

/**
 * Pushes to everyone still waiting, a batch at a time. Each batch is claimed
 * first (pending -> sending), so two runs at once can't send to one person.
 */
export async function deliverBroadcast(db: Db, broadcastId: string) {
  const { data: broadcast } = await db.from("broadcasts").select("id, title, body").eq("id", broadcastId).maybeSingle();
  if (!broadcast) return;
  const text = excerpt(`${broadcast.title}: ${broadcast.body}`, PUSH_BODY_LENGTH);

  for (;;) {
    const { data: waiting } = await db.from("broadcast_recipients").select("user_id").eq("broadcast_id", broadcastId).eq("push_status", "pending").limit(SEND_BATCH);
    if (!waiting?.length) break;

    const { data: claimed } = await db
      .from("broadcast_recipients")
      .update({ push_status: "sending", attempted_at: new Date().toISOString() })
      .eq("broadcast_id", broadcastId)
      .eq("push_status", "pending")
      .in("user_id", waiting.map((r) => r.user_id))
      .select("user_id");
    if (!claimed?.length) continue;

    const userIds = claimed.map((r) => r.user_id);
    const channelsOn = anyPushEnabled();
    const counts = channelsOn
      ? await sendPushCounted(userIds, (locale) => ({
          title: "ouiKnow",
          body: text,
          url: `/${locale}/announcements/${broadcastId}`,
          // Same tag: a retry replaces the notification instead of stacking.
          tag: `broadcast-${broadcastId}`,
        }))
      : new Map<string, { sent: number; failed: number }>();

    await Promise.all(
      userIds.map((userId) => {
        const c = counts.get(userId) ?? { sent: 0, failed: 0 };
        const status = !channelsOn || (c.sent === 0 && c.failed > 0) ? "failed" : c.sent > 0 ? "sent" : "no_device";
        return db
          .from("broadcast_recipients")
          .update({ push_status: status, devices_sent: c.sent, devices_failed: c.failed })
          .eq("broadcast_id", broadcastId)
          .eq("user_id", userId);
      }),
    );
  }

  await finishIfDone(db, broadcastId);
}

async function finishIfDone(db: Db, broadcastId: string) {
  const { count } = await db
    .from("broadcast_recipients")
    .select("user_id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .in("push_status", ["pending", "sending"]);
  if (count === 0) {
    await db.from("broadcasts").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", broadcastId);
  }
}

/** Queues the people no device accepted, and any send a restart cut off. Returns how many. */
export async function queueRetry(db: Db, broadcastId: string) {
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { data } = await db
    .from("broadcast_recipients")
    .update({ push_status: "pending" })
    .eq("broadcast_id", broadcastId)
    .or(`push_status.eq.failed,and(push_status.eq.sending,attempted_at.lt.${staleBefore})`)
    .select("user_id");
  const { count: waiting } = await db
    .from("broadcast_recipients")
    .select("user_id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("push_status", "pending");
  if (waiting) {
    await db.from("broadcasts").update({ status: "sending", finished_at: null }).eq("id", broadcastId);
  }
  return { queued: data?.length ?? 0, waiting: waiting ?? 0 };
}
