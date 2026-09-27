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

/**
 * Hard-deletes a user: their files first (Storage requirement), then the
 * auth.users row, which cascades to public.users and everything under it
 * (profiles in every category, matches, messages, ratings, saved profiles,
 * posts, notifications). Reports and admin attribution columns are ON
 * DELETE SET NULL (20260924000003), so moderation history is kept without
 * the person. Returns an error message, or null on success. Used by both
 * the admin "delete user" action and a user deleting their own account.
 */
export async function deleteUserAccount(userId: string): Promise<string | null> {
  const db = createAdminClient();

  const storageError = await removeUserStorage(db, userId);
  if (storageError) return `Could not remove the account's files (${storageError}); the account was not deleted`;

  const { error } = await db.auth.admin.deleteUser(userId);
  return error ? error.message : null;
}
