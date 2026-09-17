import { createClient } from "@/lib/supabase/server";

export type GenericMatchSide = "seeker" | "provider";

export interface GenericMatchAccess {
  id: string;
  status: string;
  interestExpiresAt: string | null;
  seekerProfileId: string;
  providerProfileId: string;
  seekerUserId: string;
  providerUserId: string;
  side: GenericMatchSide;
}

/**
 * Same shape as resolveMatchAccess in ./access.ts, but for generic_matches
 * (nursing and future categories). Loads via the request-scoped client so
 * RLS confirms the caller is genuinely a party to it.
 */
export async function resolveGenericMatchAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  userId: string,
): Promise<GenericMatchAccess | null> {
  // Two plain queries rather than a nested embed: generic_matches has two
  // FKs to the same table (generic_profiles), which needs PostgREST's
  // `!column` disambiguation hint for an embedded select -- untested here
  // since there's no live project to verify the exact embed syntax against,
  // so this sidesteps it entirely in favor of something unambiguous.
  const { data: match } = await supabase
    .from("generic_matches")
    .select("id, status, interest_expires_at, seeker_profile_id, provider_profile_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return null;

  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("id, user_id")
    .in("id", [match.seeker_profile_id, match.provider_profile_id]);

  const seekerUserId = (profiles ?? []).find((p) => p.id === match.seeker_profile_id)?.user_id;
  const providerUserId = (profiles ?? []).find((p) => p.id === match.provider_profile_id)?.user_id;

  if (!seekerUserId || !providerUserId) return null;

  const side: GenericMatchSide | null =
    userId === seekerUserId ? "seeker" : userId === providerUserId ? "provider" : null;
  if (!side) return null;

  return {
    id: match.id,
    status: match.status,
    interestExpiresAt: match.interest_expires_at,
    seekerProfileId: match.seeker_profile_id,
    providerProfileId: match.provider_profile_id,
    seekerUserId,
    providerUserId,
    side,
  };
}

/** Applies lazy expiry, same rule as effectiveStatus in ./access.ts. */
export function genericEffectiveStatus(access: Pick<GenericMatchAccess, "status" | "interestExpiresAt">): string {
  const isPending = access.status === "seeker_interested" || access.status === "provider_interested";
  if (isPending && access.interestExpiresAt && new Date(access.interestExpiresAt) < new Date()) {
    return "expired";
  }
  return access.status;
}
