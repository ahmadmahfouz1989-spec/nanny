import { createClient } from "@/lib/supabase/server";

export type InboxConversation = {
  matchId: string;
  // "nanny" for the legacy matches table, a category slug (e.g. "nursing")
  // for generic_matches -- tells the client which thread/messaging API to
  // use for this conversation.
  source: "nanny" | string;
  counterpart: { id: string; name: string; photoUrl: string | null };
  lastMessage: { body: string; createdAt: string } | null;
  unreadCount: number;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Mutual nanny/parent conversations -- same query /api/messages/inbox used before unification. */
export async function nannyConversations(supabase: Supabase, userId: string): Promise<InboxConversation[]> {
  const { data: profile } = await supabase.from("users").select("role").eq("id", userId).single();
  const role = profile?.role;

  if (role !== "parent" && role !== "nanny") {
    return [];
  }

  const ownProfileTable = role === "parent" ? "parent_profiles" : "nanny_profiles";
  const { data: ownProfile } = await supabase.from(ownProfileTable).select("id").eq("user_id", userId).maybeSingle();
  if (!ownProfile) {
    return [];
  }

  const matchColumn = role === "parent" ? "parent_profile_id" : "nanny_profile_id";
  const { data: matches } = await supabase
    .from("matches")
    .select(
      role === "parent"
        ? "id, nanny_profiles(id, full_name, profile_photo_url)"
        : "id, parent_profiles(id, full_name, profile_photo_url)",
    )
    .eq(matchColumn, ownProfile.id)
    .eq("status", "mutual");

  if (!matches || matches.length === 0) {
    return [];
  }

  const matchIds = matches.map((m) => m.id);
  const { data: allMessages } = await supabase
    .from("messages")
    .select("id, match_id, sender_id, body, created_at, read_at")
    .in("match_id", matchIds)
    .order("created_at", { ascending: true });

  type Counterpart = { id: string; full_name: string; profile_photo_url: string | null };

  return matches.map((m) => {
    const msgs = (allMessages ?? []).filter((msg) => msg.match_id === m.id);
    const lastMessage = msgs[msgs.length - 1] ?? null;
    const unreadCount = msgs.filter((msg) => msg.sender_id !== userId && !msg.read_at).length;
    const counterpart =
      role === "parent"
        ? (m as unknown as { nanny_profiles: Counterpart }).nanny_profiles
        : (m as unknown as { parent_profiles: Counterpart }).parent_profiles;

    return {
      matchId: m.id,
      source: "nanny" as const,
      counterpart: {
        id: counterpart?.id ?? "",
        name: counterpart?.full_name ?? "",
        photoUrl: counterpart?.profile_photo_url ?? null,
      },
      lastMessage: lastMessage ? { body: lastMessage.body, createdAt: lastMessage.created_at } : null,
      unreadCount,
    };
  });
}

/**
 * Mutual generic-category conversations across every category the user
 * has a profile in (nursing, tutoring, ...), not just one -- unlike
 * /api/generic-matches/inbox (kept as-is, still used by the direct
 * per-category route), this also handles a user holding both a seeker
 * and a provider profile in the same category at once.
 */
export async function genericConversations(supabase: Supabase, userId: string): Promise<InboxConversation[]> {
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
    myProfiles.map((p) => [p.id, (p.categories as unknown as { slug: string } | null)?.slug ?? ""]),
  );

  const [{ data: asSeeker }, { data: asProvider }] = await Promise.all([
    seekerProfileIds.length > 0
      ? supabase
          .from("generic_matches")
          .select("id, seeker_profile_id, provider_profile_id")
          .in("seeker_profile_id", seekerProfileIds)
          .eq("status", "mutual")
      : Promise.resolve({ data: [] }),
    providerProfileIds.length > 0
      ? supabase
          .from("generic_matches")
          .select("id, seeker_profile_id, provider_profile_id")
          .in("provider_profile_id", providerProfileIds)
          .eq("status", "mutual")
      : Promise.resolve({ data: [] }),
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
  const { data: otherProfiles } = await supabase.from("generic_profiles").select("id, full_name").in("id", otherIds);
  const otherById = new Map((otherProfiles ?? []).map((p) => [p.id, p]));

  const matchIds = matches.map((m) => m.match.id);
  const { data: allMessages } = await supabase
    .from("generic_messages")
    .select("id, match_id, sender_id, body, created_at, read_at")
    .in("match_id", matchIds)
    .order("created_at", { ascending: true });

  return matches.map(({ match, myProfileId, otherProfileId }) => {
    const msgs = (allMessages ?? []).filter((msg) => msg.match_id === match.id);
    const lastMessage = msgs[msgs.length - 1] ?? null;
    const unreadCount = msgs.filter((msg) => msg.sender_id !== userId && !msg.read_at).length;
    const other = otherById.get(otherProfileId);

    return {
      matchId: match.id,
      source: categorySlugById.get(myProfileId) ?? "",
      counterpart: { id: other?.id ?? "", name: other?.full_name ?? "", photoUrl: null },
      lastMessage: lastMessage ? { body: lastMessage.body, createdAt: lastMessage.created_at } : null,
      unreadCount,
    };
  });
}

export async function allConversations(supabase: Supabase, userId: string): Promise<InboxConversation[]> {
  const [nanny, generic] = await Promise.all([nannyConversations(supabase, userId), genericConversations(supabase, userId)]);
  return [...nanny, ...generic].sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
}
