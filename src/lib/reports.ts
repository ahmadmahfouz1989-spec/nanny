import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/**
 * Confirms a match_id/match_source actually involves exactly these two
 * users -- used both when a report is filed (so a fabricated match_id
 * never gets stored) and again when admin review reads it back (so a
 * match_id that somehow got stored unverified, e.g. via a raw insert that
 * predates report_match_participants_valid, never surfaces an unrelated
 * couple's conversation as evidence). Mirrors
 * public.report_match_participants_valid in
 * 20260923000005_validate_report_match_context.sql exactly.
 */
export async function verifyMatchParticipants(
  supabase: Supabase,
  matchSource: string,
  matchId: string,
  reporterUserId: string,
  reportedUserId: string,
): Promise<boolean> {
  if (matchSource === "nanny") {
    const { data: match } = await supabase
      .from("matches")
      .select("parent_profile_id, nanny_profile_id")
      .eq("id", matchId)
      .maybeSingle();
    if (!match) return false;
    const [{ data: parent }, { data: nanny }] = await Promise.all([
      supabase.from("parent_profiles").select("user_id").eq("id", match.parent_profile_id).single(),
      supabase.from("nanny_profiles").select("user_id").eq("id", match.nanny_profile_id).single(),
    ]);
    const participants = new Set([parent?.user_id, nanny?.user_id]);
    return participants.has(reporterUserId) && participants.has(reportedUserId);
  }

  const { data: match } = await supabase
    .from("generic_matches")
    .select("seeker_profile_id, provider_profile_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return false;
  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("id, user_id")
    .in("id", [match.seeker_profile_id, match.provider_profile_id]);
  const participants = new Set((profiles ?? []).map((p) => p.user_id));
  return participants.has(reporterUserId) && participants.has(reportedUserId);
}
