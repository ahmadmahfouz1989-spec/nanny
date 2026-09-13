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
 * Which of the given parent/nanny profile ids currently belong to a
 * Featured account. Goes through the service role: `users` RLS only
 * exposes a user's own row, but "is this profile featured" is shown on
 * everyone's match cards (same reasoning as the ratings aggregate).
 */
export async function featuredProfileIds(
  profileType: "parent" | "nanny",
  profileIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];
  const result = new Set<string>();
  if (ids.length === 0) return result;

  const admin = createAdminClient();
  const table = profileType === "parent" ? "parent_profiles" : "nanny_profiles";
  const { data: owners } = await admin.from(table).select("id, user_id").in("id", ids);
  const userIds = [...new Set((owners ?? []).map((o) => o.user_id))];
  if (userIds.length === 0) return result;

  const { data: featuredUsers } = await admin
    .from("users")
    .select("id")
    .in("id", userIds)
    .gt("featured_until", new Date().toISOString());
  const featuredUserIds = new Set((featuredUsers ?? []).map((u) => u.id));

  for (const owner of owners ?? []) {
    if (featuredUserIds.has(owner.user_id)) result.add(owner.id);
  }
  return result;
}
