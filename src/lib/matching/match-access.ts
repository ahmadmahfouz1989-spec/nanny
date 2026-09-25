// Type-only: MATCHES_API below is also imported by client components.
import type { createClient } from "@/lib/supabase/server";

/** Base of the per-match API: `${MATCHES_API}/${matchId}/messages`, ... */
export const MATCHES_API = "/api/generic-matches";

export type MatchSide = "seeker" | "provider";

export interface MatchAccess {
  id: string;
  status: string;
  interestExpiresAt: string | null;
  /** The caller's side of the match. */
  side: MatchSide;
  otherSide: MatchSide;
  myUserId: string;
  otherUserId: string;
  myProfileId: string;
  otherProfileId: string;
  /** The match's category slug (e.g. "nanny", "nursing"). */
  categorySlug: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads a match row (via the request-scoped client, so RLS confirms the
 * caller is genuinely a party to it) and resolves which side they're on.
 * Returns null if the match doesn't exist or the caller isn't a party.
 */
export async function resolveMatchAccess(supabase: Supabase, matchId: string, userId: string): Promise<MatchAccess | null> {
  // Two plain queries rather than a nested embed: generic_matches has two
  // FKs to the same table (generic_profiles), which would need PostgREST's
  // `!column` disambiguation hint for an embedded select.
  const { data: match } = await supabase
    .from("generic_matches")
    .select("id, status, interest_expires_at, seeker_profile_id, provider_profile_id, categories(slug)")
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

  const side: MatchSide | null = userId === seekerUserId ? "seeker" : userId === providerUserId ? "provider" : null;
  if (!side) return null;
  const isSeeker = side === "seeker";

  return {
    id: match.id,
    status: match.status,
    interestExpiresAt: match.interest_expires_at,
    side,
    otherSide: isSeeker ? "provider" : "seeker",
    myUserId: isSeeker ? seekerUserId : providerUserId,
    otherUserId: isSeeker ? providerUserId : seekerUserId,
    myProfileId: isSeeker ? match.seeker_profile_id : match.provider_profile_id,
    otherProfileId: isSeeker ? match.provider_profile_id : match.seeker_profile_id,
    categorySlug: (match.categories as unknown as { slug: string } | null)?.slug ?? "",
  };
}

/** Applies lazy expiry: a still-pending interest whose window has passed reads as 'expired'. */
export function effectiveStatus(access: Pick<MatchAccess, "status" | "interestExpiresAt">): string {
  const isPending = access.status.endsWith("_interested");
  if (isPending && access.interestExpiresAt && new Date(access.interestExpiresAt) < new Date()) {
    return "expired";
  }
  return access.status;
}

/** Notification payload identifying a match -- the bell resolves its link from this. */
export function matchNotificationPayload(access: MatchAccess): Record<string, string> {
  return { generic_match_id: access.id, category_slug: access.categorySlug };
}

/** Deep link into the unified inbox, opened on this conversation. */
export function conversationUrl(origin: string, locale: string, matchId: string) {
  return `${origin}/${locale}/messages?match=${matchId}`;
}
