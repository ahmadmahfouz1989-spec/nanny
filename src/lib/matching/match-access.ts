// Type-only: the MATCH_SOURCES config below is also imported by client
// components (chat thread, conversation header).
import type { createClient } from "@/lib/supabase/server";

/**
 * Which match store a conversation/match lives in: nanny/parent's original
 * `matches` table, or `generic_matches` (nursing, tutoring, and every
 * category after them). Everything downstream of "who is on which side of
 * this match" -- messaging, voice notes, contact reveal, decline, rating,
 * interest -- is identical between the two apart from table and side
 * names, so it's all written once against MatchAccess and parameterized by
 * this.
 */
export type MatchSource = "nanny" | "generic";

type SourceConfig = {
  /** Base of this source's per-match API: `${apiBase}/${matchId}/messages`, ... */
  apiBase: "/api/matches" | "/api/generic-matches";
  matchesTable: "matches" | "generic_matches";
  messagesTable: "messages" | "generic_messages";
  ratingsTable: "ratings" | "generic_ratings";
  /** [side A, side B] -- A is parent/seeker, B is nanny/provider. */
  sides: readonly [string, string];
};

export const MATCH_SOURCES: Record<MatchSource, SourceConfig> = {
  nanny: {
    apiBase: "/api/matches",
    matchesTable: "matches",
    messagesTable: "messages",
    ratingsTable: "ratings",
    sides: ["parent", "nanny"],
  },
  generic: {
    apiBase: "/api/generic-matches",
    matchesTable: "generic_matches",
    messagesTable: "generic_messages",
    ratingsTable: "generic_ratings",
    sides: ["seeker", "provider"],
  },
};

export interface MatchAccess {
  source: MatchSource;
  id: string;
  status: string;
  interestExpiresAt: string | null;
  /** The caller's side ("parent"/"nanny" or "seeker"/"provider"). */
  side: string;
  otherSide: string;
  myUserId: string;
  otherUserId: string;
  myProfileId: string;
  otherProfileId: string;
  /** The generic category's slug (e.g. "nursing"); null for nanny matches. */
  categorySlug: string | null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Loads a match row (via the request-scoped client, so RLS confirms the
 * caller is genuinely a party to it) and resolves which side they're on.
 * Returns null if the match doesn't exist or the caller isn't a party.
 */
export async function resolveMatchAccess(
  supabase: Supabase,
  source: MatchSource,
  matchId: string,
  userId: string,
): Promise<MatchAccess | null> {
  let row: {
    id: string;
    status: string;
    interestExpiresAt: string | null;
    profileIds: [string, string];
    userIds: [string | undefined, string | undefined];
    categorySlug: string | null;
  };

  if (source === "nanny") {
    const { data: match } = await supabase
      .from("matches")
      .select(
        "id, status, interest_expires_at, parent_profile_id, nanny_profile_id, parent_profiles(user_id), nanny_profiles(user_id)",
      )
      .eq("id", matchId)
      .maybeSingle();
    if (!match) return null;

    row = {
      id: match.id,
      status: match.status,
      interestExpiresAt: match.interest_expires_at,
      profileIds: [match.parent_profile_id, match.nanny_profile_id],
      userIds: [
        (match.parent_profiles as unknown as { user_id: string } | null)?.user_id,
        (match.nanny_profiles as unknown as { user_id: string } | null)?.user_id,
      ],
      categorySlug: null,
    };
  } else {
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

    row = {
      id: match.id,
      status: match.status,
      interestExpiresAt: match.interest_expires_at,
      profileIds: [match.seeker_profile_id, match.provider_profile_id],
      userIds: [
        (profiles ?? []).find((p) => p.id === match.seeker_profile_id)?.user_id,
        (profiles ?? []).find((p) => p.id === match.provider_profile_id)?.user_id,
      ],
      categorySlug: (match.categories as unknown as { slug: string } | null)?.slug ?? null,
    };
  }

  const [userA, userB] = row.userIds;
  if (!userA || !userB) return null;

  const mine = userId === userA ? 0 : userId === userB ? 1 : -1;
  if (mine === -1) return null;
  const other = mine === 0 ? 1 : 0;
  const { sides } = MATCH_SOURCES[source];

  return {
    source,
    id: row.id,
    status: row.status,
    interestExpiresAt: row.interestExpiresAt,
    side: sides[mine],
    otherSide: sides[other],
    myUserId: row.userIds[mine]!,
    otherUserId: row.userIds[other]!,
    myProfileId: row.profileIds[mine],
    otherProfileId: row.profileIds[other],
    categorySlug: row.categorySlug,
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

/** The profile table a given side's profile id points into. */
export function profileTableFor(source: MatchSource, side: string) {
  if (source === "generic") return "generic_profiles";
  return side === "parent" ? "parent_profiles" : "nanny_profiles";
}

/** Notification payload identifying a match -- the bell resolves its link from this. */
export function matchNotificationPayload(access: MatchAccess): Record<string, string> {
  return access.source === "nanny"
    ? { match_id: access.id }
    : { generic_match_id: access.id, category_slug: access.categorySlug ?? "" };
}

/** Deep link into the unified inbox, opened on this conversation. */
export function conversationUrl(origin: string, locale: string, matchId: string) {
  return `${origin}/${locale}/messages?match=${matchId}`;
}
