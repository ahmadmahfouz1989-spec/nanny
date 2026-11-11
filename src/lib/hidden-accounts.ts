import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Accounts that work normally for themselves but never show up for anyone
 * else: not in browse, search, matches or rider requests. The App Store
 * reviewer's demo account is one; its "Demo Nanny" profile was listed
 * among real providers.
 */
const HIDDEN_EMAILS = ["appreview@oui-know.com"];

let cache: { ids: string[]; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function hiddenUserIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  const { data, error } = await createAdminClient().from("users").select("id").in("email", HIDDEN_EMAILS);
  // A failed lookup hides nobody, and is asked again next time.
  if (error) return cache?.ids ?? [];
  cache = { ids: (data ?? []).map((u) => u.id), at: Date.now() };
  return cache.ids;
}

/** A PostgREST `not in` list for user_id, or null when nobody is hidden. */
export function notInList(ids: string[]): string | null {
  return ids.length ? `(${ids.join(",")})` : null;
}
