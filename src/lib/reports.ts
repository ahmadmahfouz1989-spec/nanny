import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/**
 * Confirms a match actually involves exactly these two users -- used both
 * when a report is filed (so a fabricated match_id never gets stored) and
 * again when admin review reads it back (so a match_id that somehow got
 * stored unverified never surfaces an unrelated couple's conversation as
 * evidence). Mirrors public.report_match_participants_valid. Returns the
 * match's category slug when valid (stored as reports.match_source), null
 * otherwise.
 */
export async function verifyMatchParticipants(
  supabase: Supabase,
  matchId: string,
  reporterUserId: string,
  reportedUserId: string,
): Promise<string | null> {
  const { data: match } = await supabase
    .from("generic_matches")
    .select("seeker_profile_id, provider_profile_id, categories(slug)")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return null;
  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("id, user_id")
    .in("id", [match.seeker_profile_id, match.provider_profile_id]);
  const participants = new Set((profiles ?? []).map((p) => p.user_id));
  if (!participants.has(reporterUserId) || !participants.has(reportedUserId)) return null;
  return (match.categories as unknown as { slug: string } | null)?.slug ?? null;
}
