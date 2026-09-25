import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** True when the user has paid for an active Featured placement. */
export async function isFeatured(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("featured_until")
    .eq("id", userId)
    .maybeSingle();

  return !!data?.featured_until && new Date(data.featured_until) > new Date();
}

/**
 * Which of the given users currently have an active Featured placement.
 * Goes through the service role: `users` RLS only exposes a user's own
 * row, but "is this profile featured" is shown on everyone's match cards
 * (same reasoning as the ratings aggregate).
 */
export async function featuredUserIds(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result = new Set<string>();
  if (ids.length === 0) return result;

  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id")
    .in("id", ids)
    .gt("featured_until", new Date().toISOString());

  for (const row of data ?? []) result.add(row.id);
  return result;
}
