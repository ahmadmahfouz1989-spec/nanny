import { createClient } from "@/lib/supabase/server";

export interface AdminSession {
  userId: string;
}

/**
 * Confirms the current session belongs to an active admin. Returns null
 * (never throws) so callers can uniformly respond 401/403 — this only
 * checks identity; the actual data access still goes through the
 * service-role client, since admin routes intentionally bypass RLS.
 * Suspending an admin account must actually revoke admin access even
 * though suspension never invalidates the underlying Supabase auth
 * session (same reasoning as requireActiveUser in src/lib/session.ts) --
 * checks status alongside role, and fails closed if the row can't be
 * loaded at all rather than treating a query error as "not an admin, but
 * otherwise fine".
 */
export async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AdminSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase.from("users").select("role, status").eq("id", user.id).single();
  if (error || !profile) return null;
  if (profile.role !== "admin" || profile.status === "suspended") return null;

  return { userId: user.id };
}
