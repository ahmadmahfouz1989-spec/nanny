import { createClient } from "@/lib/supabase/server";
import { ratingAggregatesByUser } from "@/lib/ratings";

type Supabase = Awaited<ReturnType<typeof createClient>>;


/**
 * Batched "did the viewer save any of these profiles" lookup. Reads the
 * viewer's OWN favorites rows, so the request-scoped client is correct
 * and sufficient (RLS already grants a user their own rows without
 * needing the service role).
 */
export async function savedProfileIds(supabase: Supabase, userId: string, profileIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return result;

  const { data } = await supabase
    .from("favorites")
    .select("generic_profile_id")
    .eq("user_id", userId)
    .in("generic_profile_id", ids);
  for (const row of data ?? []) {
    if (row.generic_profile_id) result.add(row.generic_profile_id);
  }
  return result;
}

type LocationRef = { name_en: string; name_ar: string; name_fr: string } | null;

export type SavedProfileDetail = {
  id: string;
  category: string;
  role: "seeking" | "offering";
  displayName: string;
  photoUrl: string | null;
  locationLabel: LocationRef;
  moderationStatus: string;
  attributes: Record<string, unknown>;
  rating: { average: number | null; count: number };
};

export type SavedMatchInfo = {
  id: string;
  status: string;
  score: number;
  interestExpiresAt: string | null;
  viewerSide: "seeker" | "provider";
} | null;

export type SavedListItem = {
  id: string;
  savedAt: string;
  targetProfileId: string;
  profile: SavedProfileDetail | null;
  match: SavedMatchInfo;
};

type FavoritesRow = { id: string; created_at: string; generic_profile_id: string };

/**
 * Core of GET /api/saved-profiles. Paginates the favorites rows first
 * (keyset on created_at+id, so ordering stays stable even with rows
 * inserted concurrently), then batch-fetches profile details in one
 * query via the request-scoped client, so a profile that's since become invisible (paused, back into
 * moderation, suspended owner) simply doesn't come back in that batch and
 * renders as an "unavailable" placeholder (profile: null) rather than
 * leaking why. Category/role/display fields are read live from the
 * profile tables every call, never duplicated onto the favorites row.
 */
export async function listSavedProfiles(
  supabase: Supabase,
  userId: string,
  opts: {
    category?: string;
    role?: "seeking" | "offering";
    limit: number;
    cursor: { createdAt: string; id: string } | null;
  },
): Promise<{ items: SavedListItem[]; nextCursor: { createdAt: string; id: string } | null }> {
  // Filters + join to generic_profiles/categories, applied and paginated
  // server-side in one query -- see list_saved_favorites
  // (20260926000001_nanny_to_generic.sql).
  const { data: rows } = await supabase.rpc("list_saved_favorites", {
    p_user_id: userId,
    p_category: opts.category ?? null,
    p_role: opts.role ?? null,
    p_cursor_created_at: opts.cursor?.createdAt ?? null,
    p_cursor_id: opts.cursor?.id ?? null,
    p_limit: opts.limit + 1,
  });
  const favRows = (rows ?? []) as FavoritesRow[];
  const hasMore = favRows.length > opts.limit;
  const page = hasMore ? favRows.slice(0, opts.limit) : favRows;

  const targetIds = page.map((r) => r.generic_profile_id);
  const { data: generics } = targetIds.length
    ? await supabase
        .from("generic_profiles")
        .select("id, user_id, category_id, role, full_name, profile_photo_url, moderation_status, attributes, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)")
        .in("id", targetIds)
    : { data: [] as never[] };

  type GenericRow = { id: string; user_id: string; category_id: string; role: string; full_name: string; profile_photo_url: string | null; moderation_status: string; attributes: Record<string, unknown>; locations: LocationRef; categories: { slug: string; name_en: string; name_ar: string } | null };
  const genericById = new Map(((generics ?? []) as unknown as GenericRow[]).map((g) => [g.id, g]));

  const ratingByUserId = await ratingAggregatesByUser([...genericById.values()].map((g) => g.user_id));

  // The viewer's own profiles, needed to resolve match/interest status --
  // a score is only ever shown when a real generic_matches row already
  // links the viewer's own profile to this saved target.
  const { data: myGenerics } = await supabase.from("generic_profiles").select("id, category_id, role").eq("user_id", userId);
  const myGenericByCategoryRole = new Map((myGenerics ?? []).map((g) => [`${g.category_id}:${g.role}`, g.id as string]));

  const matchByTarget = new Map<string, SavedMatchInfo>();

  // Group targets by (category_id, opposite role) so the viewer's own
  // profile for that exact pairing can be looked up and queried in one
  // batch per group, rather than per saved item.
  const groups = new Map<string, { myProfileId: string; seekerIds: string[]; providerIds: string[] }>();
  for (const g of genericById.values()) {
    const oppositeRole = g.role === "seeker" ? "provider" : "seeker";
    const myProfileId = myGenericByCategoryRole.get(`${g.category_id}:${oppositeRole}`);
    if (!myProfileId) continue;
    const key = `${g.category_id}:${oppositeRole}`;
    const group = groups.get(key) ?? { myProfileId, seekerIds: [], providerIds: [] };
    if (g.role === "seeker") group.seekerIds.push(g.id);
    else group.providerIds.push(g.id);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.seekerIds.length > 0) {
      const { data } = await supabase
        .from("generic_matches")
        .select("id, status, score, interest_expires_at, seeker_profile_id")
        .eq("provider_profile_id", group.myProfileId)
        .in("seeker_profile_id", group.seekerIds);
      for (const m of data ?? []) {
        matchByTarget.set(m.seeker_profile_id, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "provider" });
      }
    }
    if (group.providerIds.length > 0) {
      const { data } = await supabase
        .from("generic_matches")
        .select("id, status, score, interest_expires_at, provider_profile_id")
        .eq("seeker_profile_id", group.myProfileId)
        .in("provider_profile_id", group.providerIds);
      for (const m of data ?? []) {
        matchByTarget.set(m.provider_profile_id, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "seeker" });
      }
    }
  }

  const items: SavedListItem[] = page.map((row) => {
    const g = genericById.get(row.generic_profile_id);
    const profile: SavedProfileDetail | null = g
      ? {
          id: g.id, category: g.categories?.slug ?? "", role: g.role === "provider" ? "offering" : "seeking",
          displayName: g.full_name, photoUrl: g.profile_photo_url, locationLabel: g.locations,
          moderationStatus: g.moderation_status,
          attributes: g.attributes,
          rating: ratingByUserId.get(g.user_id) ?? { average: null, count: 0 },
        }
      : null;

    return {
      id: row.id,
      savedAt: row.created_at,
      targetProfileId: row.generic_profile_id,
      profile,
      match: matchByTarget.get(row.generic_profile_id) ?? null,
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.created_at, id: last.id } : null;

  return { items, nextCursor };
}
