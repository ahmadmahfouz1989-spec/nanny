import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Confirms the current session belongs to a real, non-suspended user.
 * Suspension is otherwise only enforced by the page middleware (proxy.ts),
 * whose matcher excludes /api entirely -- a session that was valid when a
 * page loaded stays valid for direct API calls even after an admin
 * suspends the account mid-session, since suspension never revokes the
 * underlying Supabase auth session. Every route that currently does
 * `const { data: { user } } = await supabase.auth.getUser()` followed by
 * `if (!user) return 401` should use this instead, same drop-in shape.
 * Returns null (never throws) so callers can uniformly respond 401,
 * exactly like requireAdmin in src/lib/admin/auth.ts.
 */
export async function requireActiveUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("status").eq("id", user.id).single();
  if (profile?.status === "suspended") return null;

  return user;
}
