import { createClient } from "@/lib/supabase/server";
import { ratingAggregatesByUser } from "@/lib/ratings";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SavedProfileType = "parent" | "nanny" | "generic";

const FK_COLUMN: Record<SavedProfileType, "parent_profile_id" | "nanny_profile_id" | "generic_profile_id"> = {
  parent: "parent_profile_id",
  nanny: "nanny_profile_id",
  generic: "generic_profile_id",
};

/**
 * Batched "did the viewer save any of these profiles" lookup, same calling
 * shape as featuredProfileIds -- but unlike that helper, this reads the
 * viewer's OWN favorites rows, so the request-scoped client is correct
 * and sufficient (RLS already grants a user their own rows without
 * needing the service role).
 */
export async function savedProfileIds(
  supabase: Supabase,
  userId: string,
  type: SavedProfileType,
  profileIds: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return result;

  const column = FK_COLUMN[type];
  const { data } = await supabase.from("favorites").select(column).eq("user_id", userId).in(column, ids);
  for (const row of data ?? []) {
    const id = (row as Record<string, string | null>)[column];
    if (id) result.add(id);
  }
  return result;
}

type LocationRef = { name_en: string; name_ar: string; name_fr: string } | null;

export type SavedProfileDetail = {
  id: string;
  type: SavedProfileType;
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
  viewerSide: string;
} | null;

export type SavedListItem = {
  id: string;
  savedAt: string;
  type: SavedProfileType;
  targetProfileId: string;
  profile: SavedProfileDetail | null;
  match: SavedMatchInfo;
};

type FavoritesRow = {
  id: string;
  created_at: string;
  parent_profile_id: string | null;
  nanny_profile_id: string | null;
  generic_profile_id: string | null;
};

function targetOf(row: FavoritesRow): { type: SavedProfileType; id: string } {
  if (row.parent_profile_id) return { type: "parent", id: row.parent_profile_id };
  if (row.nanny_profile_id) return { type: "nanny", id: row.nanny_profile_id };
  return { type: "generic", id: row.generic_profile_id! };
}

/**
 * Resolves category/role filters into a concrete set of eligible FK
 * columns (and, for generic, a concrete list of eligible generic_profile
 * ids) *before* querying favorites -- favorites itself has no
 * category/role column, so this has to happen up front rather than as a
 * post-filter after paginating, or a page could come back with fewer
 * than `limit` items even though more matching rows exist further down.
 */
async function resolveEligibility(
  supabase: Supabase,
  category: "nanny" | "nursing" | "tutoring" | undefined,
  role: "seeking" | "offering" | undefined,
): Promise<{ includeParent: boolean; includeNanny: boolean; genericIds: string[] | null }> {
  if (category === "nanny") {
    return {
      includeParent: role !== "offering",
      includeNanny: role !== "seeking",
      genericIds: [],
    };
  }

  if (category === "nursing" || category === "tutoring") {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", category).maybeSingle();
    if (!cat) return { includeParent: false, includeNanny: false, genericIds: [] };
    let q = supabase.from("generic_profiles").select("id").eq("category_id", cat.id);
    if (role === "seeking") q = q.eq("role", "seeker");
    if (role === "offering") q = q.eq("role", "provider");
    const { data: rows } = await q;
    return { includeParent: false, includeNanny: false, genericIds: (rows ?? []).map((r) => r.id) };
  }

  // No category filter ("All") -- role, if given, still narrows both the
  // nanny/parent columns and which generic profiles are eligible.
  if (role === "seeking" || role === "offering") {
    const genericRole = role === "seeking" ? "seeker" : "provider";
    const { data: rows } = await supabase.from("generic_profiles").select("id").eq("role", genericRole);
    return {
      includeParent: role === "seeking",
      includeNanny: role === "offering",
      genericIds: (rows ?? []).map((r) => r.id),
    };
  }

  return { includeParent: true, includeNanny: true, genericIds: null };
}

/**
 * Core of GET /api/saved-profiles. Paginates the favorites rows first
 * (keyset on created_at+id, so ordering stays stable even with rows
 * inserted concurrently), then batch-fetches profile details across at
 * most 3 queries -- one per target table -- via the request-scoped
 * client, so a profile that's since become invisible (paused, back into
 * moderation, suspended owner) simply doesn't come back in that batch and
 * renders as an "unavailable" placeholder (profile: null) rather than
 * leaking why. Category/role/display fields are read live from the
 * profile tables every call, never duplicated onto the favorites row.
 */
export async function listSavedProfiles(
  supabase: Supabase,
  userId: string,
  opts: {
    category?: "nanny" | "nursing" | "tutoring";
    role?: "seeking" | "offering";
    limit: number;
    cursor: { createdAt: string; id: string } | null;
  },
): Promise<{ items: SavedListItem[]; nextCursor: { createdAt: string; id: string } | null }> {
  const { includeParent, includeNanny, genericIds } = await resolveEligibility(supabase, opts.category, opts.role);

  const orParts: string[] = [];
  if (includeParent) orParts.push("parent_profile_id.not.is.null");
  if (includeNanny) orParts.push("nanny_profile_id.not.is.null");
  if (genericIds === null) {
    orParts.push("generic_profile_id.not.is.null");
  } else if (genericIds.length > 0) {
    orParts.push(`generic_profile_id.in.(${genericIds.join(",")})`);
  }

  if (orParts.length === 0) {
    return { items: [], nextCursor: null };
  }

  let query = supabase
    .from("favorites")
    .select("id, created_at, parent_profile_id, nanny_profile_id, generic_profile_id")
    .eq("user_id", userId)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);

  if (opts.cursor) {
    query = query.or(`created_at.lt.${opts.cursor.createdAt},and(created_at.eq.${opts.cursor.createdAt},id.lt.${opts.cursor.id})`);
  }

  const { data: rows } = await query;
  const favRows = (rows ?? []) as FavoritesRow[];
  const hasMore = favRows.length > opts.limit;
  const page = hasMore ? favRows.slice(0, opts.limit) : favRows;

  const parentIds = page.filter((r) => r.parent_profile_id).map((r) => r.parent_profile_id!);
  const nannyIds = page.filter((r) => r.nanny_profile_id).map((r) => r.nanny_profile_id!);
  const pageGenericIds = page.filter((r) => r.generic_profile_id).map((r) => r.generic_profile_id!);

  const [{ data: parents }, { data: nannies }, { data: generics }] = await Promise.all([
    parentIds.length
      ? supabase
          .from("parent_profiles")
          .select("id, user_id, full_name, profile_photo_url, moderation_status, nationality, num_children, schedule_type, live_arrangement, locations(name_en, name_ar, name_fr)")
          .in("id", parentIds)
      : Promise.resolve({ data: [] as never[] }),
    nannyIds.length
      ? supabase
          .from("nanny_profiles")
          .select("id, user_id, full_name, profile_photo_url, moderation_status, nationality, years_experience, employment_type, live_arrangement_pref, locations(name_en, name_ar, name_fr)")
          .in("id", nannyIds)
      : Promise.resolve({ data: [] as never[] }),
    pageGenericIds.length
      ? supabase
          .from("generic_profiles")
          .select("id, user_id, category_id, role, full_name, moderation_status, attributes, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)")
          .in("id", pageGenericIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  type ParentRow = { id: string; user_id: string; full_name: string; profile_photo_url: string | null; moderation_status: string; nationality: string | null; num_children: number; schedule_type: string; live_arrangement: string; locations: LocationRef };
  type NannyRow = { id: string; user_id: string; full_name: string; profile_photo_url: string | null; moderation_status: string; nationality: string | null; years_experience: number; employment_type: string; live_arrangement_pref: string; locations: LocationRef };
  type GenericRow = { id: string; user_id: string; category_id: string; role: string; full_name: string; moderation_status: string; attributes: Record<string, unknown>; locations: LocationRef; categories: { slug: string; name_en: string; name_ar: string } | null };

  const parentById = new Map(((parents ?? []) as unknown as ParentRow[]).map((p) => [p.id, p]));
  const nannyById = new Map(((nannies ?? []) as unknown as NannyRow[]).map((n) => [n.id, n]));
  const genericById = new Map(((generics ?? []) as unknown as GenericRow[]).map((g) => [g.id, g]));

  const ownerUserIds = [
    ...[...parentById.values()].map((p) => p.user_id),
    ...[...nannyById.values()].map((n) => n.user_id),
    ...[...genericById.values()].map((g) => g.user_id),
  ];
  const ratingByUserId = await ratingAggregatesByUser(ownerUserIds);

  // The viewer's own profiles, needed to resolve match/interest status --
  // a score is only ever shown when a real matches/generic_matches row
  // already links the viewer's own profile to this saved target.
  const [{ data: myParent }, { data: myNanny }, { data: myGenerics }] = await Promise.all([
    supabase.from("parent_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("nanny_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("generic_profiles").select("id, category_id, role").eq("user_id", userId),
  ]);
  const myGenericByCategoryRole = new Map((myGenerics ?? []).map((g) => [`${g.category_id}:${g.role}`, g.id as string]));

  const matchByTarget = new Map<string, SavedMatchInfo>();

  if (myParent?.id && nannyIds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select("id, status, score, interest_expires_at, nanny_profile_id")
      .eq("parent_profile_id", myParent.id)
      .in("nanny_profile_id", nannyIds);
    for (const m of data ?? []) {
      matchByTarget.set(`nanny:${m.nanny_profile_id}`, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "parent" });
    }
  }
  if (myNanny?.id && parentIds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select("id, status, score, interest_expires_at, parent_profile_id")
      .eq("nanny_profile_id", myNanny.id)
      .in("parent_profile_id", parentIds);
    for (const m of data ?? []) {
      matchByTarget.set(`parent:${m.parent_profile_id}`, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "nanny" });
    }
  }

  // Group generic targets by (category_id, opposite role) so the viewer's
  // own profile for that exact pairing can be looked up and queried in
  // one batch per group, rather than per saved item.
  const genericGroups = new Map<string, { myProfileId: string; seekerIds: string[]; providerIds: string[] }>();
  for (const g of genericById.values()) {
    const oppositeRole = g.role === "seeker" ? "provider" : "seeker";
    const myProfileId = myGenericByCategoryRole.get(`${g.category_id}:${oppositeRole}`);
    if (!myProfileId) continue;
    const key = `${g.category_id}:${oppositeRole}`;
    const group = genericGroups.get(key) ?? { myProfileId, seekerIds: [], providerIds: [] };
    if (g.role === "seeker") group.seekerIds.push(g.id);
    else group.providerIds.push(g.id);
    genericGroups.set(key, group);
  }
  for (const group of genericGroups.values()) {
    if (group.seekerIds.length > 0) {
      const { data } = await supabase
        .from("generic_matches")
        .select("id, status, score, interest_expires_at, seeker_profile_id")
        .eq("provider_profile_id", group.myProfileId)
        .in("seeker_profile_id", group.seekerIds);
      for (const m of data ?? []) {
        matchByTarget.set(`generic:${m.seeker_profile_id}`, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "provider" });
      }
    }
    if (group.providerIds.length > 0) {
      const { data } = await supabase
        .from("generic_matches")
        .select("id, status, score, interest_expires_at, provider_profile_id")
        .eq("seeker_profile_id", group.myProfileId)
        .in("provider_profile_id", group.providerIds);
      for (const m of data ?? []) {
        matchByTarget.set(`generic:${m.provider_profile_id}`, { id: m.id, status: m.status, score: m.score, interestExpiresAt: m.interest_expires_at, viewerSide: "seeker" });
      }
    }
  }

  const items: SavedListItem[] = page.map((row) => {
    const target = targetOf(row);
    let profile: SavedProfileDetail | null = null;

    if (target.type === "parent") {
      const p = parentById.get(target.id);
      if (p) {
        profile = {
          id: p.id, type: "parent", category: "nanny", role: "seeking",
          displayName: p.full_name, photoUrl: p.profile_photo_url, locationLabel: p.locations,
          moderationStatus: p.moderation_status,
          attributes: { nationality: p.nationality, numChildren: p.num_children, scheduleType: p.schedule_type, liveArrangement: p.live_arrangement },
          rating: ratingByUserId.get(p.user_id) ?? { average: null, count: 0 },
        };
      }
    } else if (target.type === "nanny") {
      const n = nannyById.get(target.id);
      if (n) {
        profile = {
          id: n.id, type: "nanny", category: "nanny", role: "offering",
          displayName: n.full_name, photoUrl: n.profile_photo_url, locationLabel: n.locations,
          moderationStatus: n.moderation_status,
          attributes: { nationality: n.nationality, yearsExperience: n.years_experience, employmentType: n.employment_type, liveArrangementPref: n.live_arrangement_pref },
          rating: ratingByUserId.get(n.user_id) ?? { average: null, count: 0 },
        };
      }
    } else {
      const g = genericById.get(target.id);
      if (g) {
        profile = {
          id: g.id, type: "generic", category: g.categories?.slug ?? "", role: g.role === "provider" ? "offering" : "seeking",
          displayName: g.full_name, photoUrl: null, locationLabel: g.locations,
          moderationStatus: g.moderation_status,
          attributes: g.attributes,
          rating: ratingByUserId.get(g.user_id) ?? { average: null, count: 0 },
        };
      }
    }

    return {
      id: row.id,
      savedAt: row.created_at,
      type: target.type,
      targetProfileId: target.id,
      profile,
      match: matchByTarget.get(`${target.type}:${target.id}`) ?? null,
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.created_at, id: last.id } : null;

  return { items, nextCursor };
}
