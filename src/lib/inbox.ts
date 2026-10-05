import { createClient } from "@/lib/supabase/server";

export type InboxConversation = {
  matchId: string;
  /** The match's category (e.g. "nanny", "nursing"). */
  categorySlug: string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-match last-message and unread-count. Computed in SQL (see
 * generic_message_summaries_for_matches,
 * 20260923000008_inbox_message_summaries_rpc.sql) via DISTINCT ON rather
 * than fetching a page of "recent" messages across every match combined
 * app-side -- that approach silently dropped a match's last message
 * entirely once some OTHER busy conversation's messages filled the whole
 * page first, corrupting exactly the "what's the latest message" preview
 * this is for. A true per-match aggregate has no such cap to exceed.
 */
export async function messageSummariesByMatch(supabase: Supabase, matchIds: string[], userId: string) {
  const lastMessageByMatch = new Map<string, { body: string; createdAt: string }>();
  const unreadCountByMatch = new Map<string, number>();
  if (matchIds.length === 0) return { lastMessageByMatch, unreadCountByMatch };

  const { data: summaries } = await supabase.rpc("generic_message_summaries_for_matches", {
    p_match_ids: matchIds,
    p_user_id: userId,
  });

  for (const row of summaries ?? []) {
    if (row.last_body !== null && row.last_created_at !== null) {
      lastMessageByMatch.set(row.match_id, { body: row.last_body, createdAt: row.last_created_at });
    }
    if (row.unread_count > 0) {
      unreadCountByMatch.set(row.match_id, Number(row.unread_count));
    }
  }

  return { lastMessageByMatch, unreadCountByMatch };
}

/**
 * Every conversation the user has (a match with at least one message),
 * across every category they hold a profile in -- including both roles in
 * one category -- newest first. Blocked matches are left out.
 * `includeMatchId` also returns that one match before anything has been
 * written in it, so "Message" on a match card opens an empty thread.
 */
export async function allConversations(
  supabase: Supabase,
  userId: string,
  includeMatchId: string | null = null,
): Promise<InboxConversation[]> {
  const { data: myProfiles } = await supabase
    .from("generic_profiles")
    .select("id, role, categories(slug)")
    .eq("user_id", userId);

  if (!myProfiles || myProfiles.length === 0) {
    return [];
  }

  const seekerProfileIds = myProfiles.filter((p) => p.role === "seeker").map((p) => p.id);
  const providerProfileIds = myProfiles.filter((p) => p.role === "provider").map((p) => p.id);
  const categorySlugById = new Map(
    myProfiles.map((p) => [p.id, p.categories?.slug ?? ""]),
  );

  // Only a well-formed uuid is spliced into the filter below.
  const include = includeMatchId && UUID.test(includeMatchId) ? includeMatchId : null;
  const conversationFilter = include ? `last_message_at.not.is.null,id.eq.${include}` : "last_message_at.not.is.null";
  const mine = (column: "seeker_profile_id" | "provider_profile_id", ids: string[]) =>
    ids.length > 0
      ? supabase
          .from("generic_matches")
          .select("id, seeker_profile_id, provider_profile_id")
          .in(column, ids)
          .not("status", "in", "(declined_by_seeker,declined_by_provider)")
          .or(conversationFilter)
      : Promise.resolve({ data: [] });

  const [{ data: asSeeker }, { data: asProvider }] = await Promise.all([
    mine("seeker_profile_id", seekerProfileIds),
    mine("provider_profile_id", providerProfileIds),
  ]);

  type MatchRow = { id: string; seeker_profile_id: string; provider_profile_id: string };
  const matches: { match: MatchRow; myProfileId: string; otherProfileId: string }[] = [
    ...(asSeeker ?? []).map((m: MatchRow) => ({ match: m, myProfileId: m.seeker_profile_id, otherProfileId: m.provider_profile_id })),
    ...(asProvider ?? []).map((m: MatchRow) => ({ match: m, myProfileId: m.provider_profile_id, otherProfileId: m.seeker_profile_id })),
  ];

  if (matches.length === 0) {
    return [];
  }

  const otherIds = [...new Set(matches.map((m) => m.otherProfileId))];
  const { data: otherProfiles } = await supabase
    .from("generic_profiles")
    .select("id, full_name, profile_photo_url")
    .in("id", otherIds);
  const otherById = new Map((otherProfiles ?? []).map((p) => [p.id, p]));

  const matchIds = matches.map((m) => m.match.id);
  const { lastMessageByMatch, unreadCountByMatch } = await messageSummariesByMatch(supabase, matchIds, userId);

  const conversations = matches.map(({ match, myProfileId, otherProfileId }) => {
    const other = otherById.get(otherProfileId);

    return {
      matchId: match.id,
      categorySlug: categorySlugById.get(myProfileId) ?? "",
      counterpart: { id: other?.id ?? "", name: other?.full_name ?? "", photoUrl: other?.profile_photo_url ?? null },
      lastMessage: lastMessageByMatch.get(match.id) ?? null,
      unreadCount: unreadCountByMatch.get(match.id) ?? 0,
    };
  });

  return conversations.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
}
