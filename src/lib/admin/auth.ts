import { createClient } from "@/lib/supabase/server";

export interface AdminSession {
  userId: string;
}

/**
 * Confirms the current session belongs to an admin. Returns null (never
 * throws) so callers can uniformly respond 401/403 — this only checks
 * identity; the actual data access still goes through the service-role
 * client, since admin routes intentionally bypass RLS.
 */
export async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AdminSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;

  return { userId: user.id };
}
