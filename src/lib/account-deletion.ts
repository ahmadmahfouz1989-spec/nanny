import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Every bucket a user uploads into with their own session, all keyed by a
// leading `${userId}/` folder (see the storage policies in the migrations).
const USER_BUCKETS = ["nanny-photos", "parent-photos", "generic-photos", "voice-notes"] as const;
const LIST_PAGE_SIZE = 1000;

// Supabase refuses to delete an auth user who still owns Storage objects,
// so those have to go first. Returns an error message, or null once every
// bucket's folder is empty. Safe to re-run: a retry after a partial
// failure just finds fewer files.
async function removeUserStorage(db: Admin, userId: string): Promise<string | null> {
  for (const bucket of USER_BUCKETS) {
    const paths: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await db.storage.from(bucket).list(userId, { limit: LIST_PAGE_SIZE, offset });
      if (error) return `${bucket}: ${error.message}`;
      paths.push(...(data ?? []).map((f) => `${userId}/${f.name}`));
      if (!data || data.length < LIST_PAGE_SIZE) break;
    }
    for (let i = 0; i < paths.length; i += LIST_PAGE_SIZE) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + LIST_PAGE_SIZE));
      if (error) return `${bucket}: ${error.message}`;
    }
  }
  return null;
}

const IN_BATCH = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_BATCH) out.push(items.slice(i, i + IN_BATCH));
  return out;
}

/**
 * What else goes with this user that the database can't cascade on its
 * own: voice notes the *other* person sent in the user's conversations
 * (stored in that person's folder, so they'd be left with nothing pointing
 * at them once the conversation is gone), and other users' notifications
 * that point at the user's matches, posts or replies.
 */
async function relatedToUser(db: Admin, userId: string) {
  const [{ data: profiles }, { data: posts }, { data: replies }] = await Promise.all([
    db.from("generic_profiles").select("id").eq("user_id", userId),
    db.from("posts").select("id").eq("user_id", userId),
    db.from("post_replies").select("id").eq("user_id", userId),
  ]);
  const profileIds = (profiles ?? []).map((p) => p.id);

  const matchIds: string[] = [];
  for (const batch of chunks(profileIds)) {
    const [{ data: asSeeker }, { data: asProvider }] = await Promise.all([
      db.from("generic_matches").select("id").in("seeker_profile_id", batch),
      db.from("generic_matches").select("id").in("provider_profile_id", batch),
    ]);
    matchIds.push(...[...(asSeeker ?? []), ...(asProvider ?? [])].map((m) => m.id));
  }

  const otherVoiceNotes: string[] = [];
  for (const batch of chunks(matchIds)) {
    const { data } = await db
      .from("generic_messages")
      .select("audio_path")
      .in("match_id", batch)
      .neq("sender_id", userId)
      .not("audio_path", "is", null);
    otherVoiceNotes.push(...(data ?? []).map((m) => m.audio_path as string));
  }

  return {
    matchIds,
    postIds: (posts ?? []).map((p) => p.id),
    replyIds: (replies ?? []).map((r) => r.id),
    otherVoiceNotes,
  };
}

async function removeNotificationsPointingAt(db: Admin, key: string, ids: string[]) {
  for (const batch of chunks(ids)) {
    await db.from("notifications").delete().in(`payload->>${key}`, batch);
  }
}

/**
 * Hard-deletes a user: their files first (Storage requirement), then the
 * auth.users row, which cascades to public.users and everything under it
 * (profiles in every category, matches, messages, ratings, saved profiles,
 * posts, replies, likes, blocks, notifications). Voice notes the other
 * person sent in the user's conversations, and other users' notifications
 * about the user's matches/posts/replies, are removed too (relatedToUser).
 * Reports, admin attribution and login history are ON DELETE SET NULL
 * (20260924000003), so moderation history is kept without the person. Returns an error message, or null on success. Used by both
 * the admin "delete user" action and a user deleting their own account.
 */
export async function deleteUserAccount(userId: string): Promise<string | null> {
  const db = createAdminClient();

  const related = await relatedToUser(db, userId);

  const storageError = await removeUserStorage(db, userId);
  if (storageError) return `Could not remove the account's files (${storageError}); the account was not deleted`;
  for (const batch of chunks(related.otherVoiceNotes)) {
    const { error } = await db.storage.from("voice-notes").remove(batch);
    if (error) return `Could not remove conversation voice notes (${error.message}); the account was not deleted`;
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return error.message;

  // Only once the account is really gone. Best-effort: a stale
  // notification is harmless, and the deletion itself already succeeded.
  await removeNotificationsPointingAt(db, "generic_match_id", related.matchIds).catch(() => {});
  await removeNotificationsPointingAt(db, "post_id", related.postIds).catch(() => {});
  await removeNotificationsPointingAt(db, "reply_id", related.replyIds).catch(() => {});
  return null;
}
