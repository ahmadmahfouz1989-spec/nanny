import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategories } from "@/lib/categories";
import { normalizeForSearch, searchAlternatives, searchWords } from "@/lib/profile-search";
import { fillMissingSearchText } from "@/lib/search-text";
import { POST_FEED_COLUMNS, resolvePostAuthors } from "@/lib/posts";
import { withPlaceNames } from "@/lib/place-names";
import { featuredUserIds } from "@/lib/featured";

/** Results per section; a full section shows its count as "20+". */
export const SEARCH_LIMIT = 20;

export type PersonResult = {
  id: string;
  role: "seeker" | "provider";
  fullName: string;
  photoUrl: string | null;
  categorySlug: string;
  categoryName: string;
  place: string | null;
  about: string | null;
  /** Verified (blue check): shown first. */
  verified: boolean;
};

export type PostResult = {
  id: string;
  kind: "looking_for" | "offering";
  caption: string;
  createdAt: string;
  authorName: string;
  authorPhotoUrl: string | null;
};

export type SearchResults = {
  offering: PersonResult[];
  seeking: PersonResult[];
  posts: PostResult[];
};

// PostgREST filter strings treat , . ( ) : * as syntax, so a word only
// keeps its letters and digits (Arabic included) before it goes into one.
function safeWord(word: string) {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

function about(a: Record<string, unknown>): string | null {
  for (const key of ["shortIntro", "jobDescription", "familyDescription", "additionalNotes"]) {
    if (typeof a[key] === "string" && (a[key] as string).trim()) return a[key] as string;
  }
  return null;
}

/**
 * Home's search: approved profiles and open posts whose words contain
 * every word typed. A profile also matches on its category's own name and
 * description, so "nurse" finds nurses whose profile never says the word,
 * and "plumber Jounieh" finds plumbers who mention Jounieh. `region`
 * narrows profiles to a governorate or a district -- where they live or
 * one they also cover. Someone's name is found anywhere in Lebanon and comes
 * first, since a person being looked up by name may be outside the area.
 * Never the viewer's own profiles.
 * Runs as the viewer, so the usual visibility rules apply (approved,
 * active, not suspended).
 *
 * Signed out (`userId` null): providers only, with their public page on,
 * read on the server (visitors can't read profiles themselves) -- never
 * seekers or posts.
 */
export async function search(query: string, region: string | null, userId: string | null, locale: string): Promise<SearchResults> {
  const words = searchWords(query).map(safeWord).filter(Boolean);
  if (words.length === 0) return { offering: [], seeking: [], posts: [] };

  const visitor = userId === null;
  const supabase = visitor ? createAdminClient() : await createClient();
  // The region is a governorate or a district (Home's area picker).
  const { data: regionRow } = region
    ? await supabase.from("locations").select("level, parent_location_id").eq("id", region).maybeSingle()
    : { data: null };
  const regionLevel = regionRow?.level ?? null;
  const regionParent = regionRow?.parent_location_id ?? null;
  const categories = (await getCategories()).filter((c) => c.status === "live");
  // Profiles saved before search_text existed would otherwise never match.
  await Promise.all(categories.map((c) => fillMissingSearchText(c.id)));

  const categoryText = new Map(
    categories.map((c) => [c.id, normalizeForSearch([c.name_en, c.name_ar, c.tagline_en, c.tagline_ar].join(" "))]),
  );

  const visibleProfiles = (role: "seeker" | "provider") => {
    const q = supabase
      .from("generic_profiles")
      .select("id, user_id, role, full_name, profile_photo_url, attributes, category_id, locations(name_en, name_ar, name_fr)")
      .eq("role", role)
      .eq("status", "active")
      .eq("moderation_status", "approved")
      .in("category_id", categories.map((c) => c.id));
    return visitor ? q.eq("public_page", true) : q.neq("user_id", userId);
  };

  const named = (role: "seeker" | "provider") => {
    let q = visibleProfiles(role);
    // The name is what comes before search_text's first separator, already
    // normalised like the words, so "اية" finds "آية".
    for (const w of words) q = q.filter("search_text", "match", `^[^\\x01]*${w}`);
    return q.order("created_at", { ascending: false }).limit(SEARCH_LIMIT);
  };

  const people = (role: "seeker" | "provider") => {
    let q = visibleProfiles(role);
    for (const w of words) {
      // The word, or the word its everyday synonyms are stored under.
      const alts = searchAlternatives(w).map(safeWord).filter(Boolean);
      const inCategories = categories.filter((c) => alts.some((a) => categoryText.get(c.id)!.includes(a))).map((c) => c.id);
      const clauses = alts.map((a) => `search_text.ilike.*${a}*`);
      if (inCategories.length) clauses.push(`category_id.in.(${inCategories.join(",")})`);
      q = q.or(clauses.join(","));
    }
    if (region && regionLevel === "district") {
      // In the district, covering it, or (saved before districts) in its governorate.
      q = q.or(
        `attributes->>districtId.eq.${region},attributes->coverDistrictIds.cs.["${region}"]` +
          (regionParent ? `,and(attributes->>districtId.is.null,location_id.eq.${regionParent})` : ""),
      );
    } else if (region) {
      q = q.or(`location_id.eq.${region},attributes->serviceAreaIds.cs.["${region}"]`);
    }
    return q.order("created_at", { ascending: false }).limit(SEARCH_LIMIT);
  };

  let postQuery = supabase.from("posts").select(POST_FEED_COLUMNS).eq("status", "open");
  for (const w of words) {
    postQuery = postQuery.or(searchAlternatives(w).map(safeWord).filter(Boolean).map((a) => `caption.ilike.*${a}*`).join(","));
  }

  const none = Promise.resolve({ data: [] as never[] });
  const [{ data: namedProviders }, { data: namedSeekers }, { data: providersRaw }, { data: seekersRaw }, { data: posts }] = await Promise.all([
    named("provider"),
    visitor ? none : named("seeker"),
    people("provider"),
    visitor ? none : people("seeker"),
    visitor ? none : postQuery.order("created_at", { ascending: false }).limit(SEARCH_LIMIT),
  ]);
  // The database's own rule hides suspended accounts from signed-in
  // viewers; read on the server for a visitor, it's done here.
  const nameMatches = new Set([...(namedProviders ?? []), ...(namedSeekers ?? [])].map((p) => p.id));
  const namesFirst = <T extends { id: string }>(byName: T[] | null, others: T[] | null) =>
    [...(byName ?? []), ...(others ?? []).filter((p) => !nameMatches.has(p.id))].slice(0, SEARCH_LIMIT);
  let shownProviders = namesFirst(namedProviders, providersRaw);
  if (visitor && shownProviders.length) {
    const { data: suspended } = await supabase
      .from("users")
      .select("id")
      .in("id", shownProviders.map((p) => p.user_id))
      .eq("status", "suspended");
    const out = new Set((suspended ?? []).map((u) => u.id));
    shownProviders = shownProviders.filter((p) => !out.has(p.user_id));
  }
  const [providers, seekers] = await Promise.all([withPlaceNames(shownProviders), withPlaceNames(namesFirst(namedSeekers, seekersRaw))]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const verified = await featuredUserIds([...(providers ?? []), ...(seekers ?? [])].map((p) => p.user_id));
  const toPerson = (p: NonNullable<typeof providers>[number]): PersonResult => {
    const c = byId.get(p.category_id);
    const place = Array.isArray(p.locations) ? p.locations[0] : p.locations;
    return {
      id: p.id,
      role: p.role as "seeker" | "provider",
      fullName: p.full_name,
      photoUrl: p.profile_photo_url,
      categorySlug: c?.slug ?? "",
      categoryName: c ? (locale === "ar" ? c.name_ar : c.name_en) : "",
      place: place ? (locale === "ar" ? place.name_ar : place.name_en) : null,
      about: about((p.attributes ?? {}) as Record<string, unknown>),
      verified: verified.has(p.user_id),
    };
  };
  // The name typed first; then verified people, then profiles with a photo:
  // they're the ones people tap.
  const ranked = (rows: typeof providers) =>
    (rows ?? [])
      .map(toPerson)
      .sort(
        (a, b) =>
          Number(nameMatches.has(b.id)) - Number(nameMatches.has(a.id)) ||
          Number(b.verified) - Number(a.verified) ||
          Number(!!b.photoUrl) - Number(!!a.photoUrl),
      );

  const authors = await resolvePostAuthors(posts ?? []);
  return {
    offering: ranked(providers),
    seeking: ranked(seekers),
    posts: (posts ?? []).map((p) => ({
      id: p.id,
      kind: p.kind as "looking_for" | "offering",
      caption: p.caption,
      createdAt: p.created_at,
      authorName: authors.get(p.id)?.fullName ?? "",
      authorPhotoUrl: authors.get(p.id)?.photoUrl ?? null,
    })),
  };
}
