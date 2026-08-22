import { createClient } from "@/lib/supabase/server";

export type MatchSide = "parent" | "nanny";

export interface MatchAccess {
  id: string;
  status: string;
  interestExpiresAt: string | null;
  parentProfileId: string;
  nannyProfileId: string;
  parentUserId: string;
  nannyUserId: string;
  side: MatchSide;
}

/**
 * Loads a match row (via the request-scoped client, so RLS confirms the
 * caller is genuinely a party to it) and resolves which side they're on.
 * Returns null if the match doesn't exist or the caller isn't a party.
 */
export async function resolveMatchAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  userId: string,
): Promise<MatchAccess | null> {
  const { data: match } = await supabase
    .from("matches")
    .select(
      "id, status, interest_expires_at, parent_profile_id, nanny_profile_id, parent_profiles(user_id), nanny_profiles(user_id)",
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return null;

  const parentUserId = (match.parent_profiles as unknown as { user_id: string } | null)?.user_id;
  const nannyUserId = (match.nanny_profiles as unknown as { user_id: string } | null)?.user_id;

  if (!parentUserId || !nannyUserId) return null;

  const side: MatchSide | null = userId === parentUserId ? "parent" : userId === nannyUserId ? "nanny" : null;
  if (!side) return null;

  return {
    id: match.id,
    status: match.status,
    interestExpiresAt: match.interest_expires_at,
    parentProfileId: match.parent_profile_id,
    nannyProfileId: match.nanny_profile_id,
    parentUserId,
    nannyUserId,
    side,
  };
}

/** Applies lazy expiry: a still-pending interest whose window has passed reads as 'expired'. */
export function effectiveStatus(access: Pick<MatchAccess, "status" | "interestExpiresAt">): string {
  const isPending = access.status === "parent_interested" || access.status === "nanny_interested";
  if (isPending && access.interestExpiresAt && new Date(access.interestExpiresAt) < new Date()) {
    return "expired";
  }
  return access.status;
}
