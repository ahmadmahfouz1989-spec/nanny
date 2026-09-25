import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";

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

// Hard-delete a user: removes the auth.users row, which cascades to
// public.users and everything under it (profiles, matches, messages,
// ratings, notifications, subscription grants). Reports and admin
// attribution columns are ON DELETE SET NULL (20260924000003), so the
// database clears them in the same transaction as the delete itself --
// nothing about moderation history is touched unless the delete actually
// succeeds. The only step that runs beforehand is Storage cleanup, which
// Supabase requires; it's idempotent, so a failed attempt can be retried.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (id === admin.userId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const db = createAdminClient();

  const storageError = await removeUserStorage(db, id);
  if (storageError) {
    return NextResponse.json({ error: `Could not remove the user's files (${storageError}); the account was not deleted` }, { status: 500 });
  }

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "deleted" });
}
