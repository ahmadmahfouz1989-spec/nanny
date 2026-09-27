import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser } from "@/lib/ratings";
import { savedProfileIds } from "@/lib/saved-profiles";
import { searchWords } from "@/lib/profile-search";
import { fillMissingSearchText } from "@/lib/search-text";
import { asAttributes } from "@/lib/attributes";

/**
 * Lists matches for the caller's own profile in a category, best first:
 * Featured profiles, then by score. Paged (`page`, `pageSize`); `total`
 * is the full filtered count.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categorySlug = searchParams.get("categorySlug");
  if (!categorySlug) {
    return NextResponse.json({ error: "categorySlug is required" }, { status: 400 });
  }

  const { data: category } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
  if (!category) {
    return NextResponse.json({ error: "Unknown category" }, { status: 404 });
  }

  // The schema allows one seeker AND one provider profile per user per
  // category (someone who tutors and also seeks a tutor for their own
  // kid) -- .maybeSingle() on user+category alone would error on two rows
  // and get misread as "no profile" below. Fetch every non-draft row and
  // let an explicit ?role= pick between them when there's more than one.
  const requestedRole = searchParams.get("role");
  const { data: myProfiles, error: myProfilesError } = await supabase
    .from("generic_profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .neq("status", "draft");

  if (myProfilesError) {
    return NextResponse.json({ error: myProfilesError.message }, { status: 400 });
  }

  const myProfile =
    (myProfiles ?? []).length <= 1
      ? (myProfiles ?? [])[0]
      : (myProfiles ?? []).find((p) => p.role === requestedRole);

  if (!myProfile) {
    return NextResponse.json({ error: "Create your profile before browsing matches" }, { status: 404 });
  }

  // Profiles saved before search_text existed get it now (once).
  await fillMissingSearchText(category.id);

  // Filters, search, order (Featured first, then best match) and paging all
  // happen in the database -- see list_profile_matches. matchId is a
  // notification's target card, returned on its own even when the
  // viewer's current filters or page would hide it.
  const matchId = searchParams.get("matchId");
  const minYears = Number(searchParams.get("minYearsExperience"));
  const words = searchWords(searchParams.get("q")?.slice(0, 100) ?? "");
  const page = matchId ? 1 : Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

  const { data: rows, error } = await supabase.rpc("list_profile_matches", {
    p_profile_id: myProfile.id,
    p_governorate_id: searchParams.get("governorateId") || undefined,
    p_day: searchParams.get("day") || undefined,
    p_min_years: minYears > 0 ? minYears : undefined,
    p_words: words.length ? words : undefined,
    p_match_id: matchId || undefined,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const pageRows = rows ?? [];
  const total = Number(pageRows[0]?.total ?? 0);
  if (pageRows.length === 0) {
    return NextResponse.json({ myRole: myProfile.role, results: [], total });
  }

  // Details for just this page.
  const matchIds = pageRows.map((r) => r.match_id);
  const otherIds = pageRows.map((r) => r.other_profile_id);
  const [{ data: matches }, { data: otherProfiles }] = await Promise.all([
    supabase
      .from("generic_matches")
      .select("id, score, score_breakdown, status, interest_expires_at, seeker_profile_id, provider_profile_id")
      .in("id", matchIds),
    supabase
      .from("generic_profiles")
      .select("id, full_name, profile_photo_url, location_id, attributes, locations(name_en, name_ar, name_fr)")
      .in("id", otherIds),
  ]);

  // Languages are stored as bare ids in attributes -- resolve them once for
  // the page so cards can show names.
  type Language = { id: string; name_en: string; name_ar: string; name_fr: string };
  const languageIds = [
    ...new Set(
      (otherProfiles ?? []).flatMap((p) => {
        const ids = asAttributes(p.attributes).languageIds;
        return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
      }),
    ),
  ];
  const { data: languageRows } =
    languageIds.length > 0
      ? await supabase.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds)
      : { data: [] as Language[] };
  const languageById = new Map((languageRows ?? []).map((l) => [l.id, l]));

  const otherById = new Map(
    (otherProfiles ?? []).map((p) => {
      const attributes = asAttributes(p.attributes);
      const ids = attributes.languageIds;
      const languages = (Array.isArray(ids) ? ids : []).map((id) => languageById.get(id)).filter((l): l is Language => !!l);
      return [p.id, { ...p, attributes, languages }];
    }),
  );
  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));

  // Each counterpart's aggregate rating -- the profile→user_id mapping stays
  // server-side (user_id is never part of the response).
  const admin = createAdminClient();
  const { data: owners } = await admin.from("generic_profiles").select("id, user_id").in("id", otherIds);
  const aggregates = await ratingAggregatesByUser((owners ?? []).map((o) => o.user_id));
  const ratingByProfileId = new Map(
    (owners ?? []).map((o) => [o.id, aggregates.get(o.user_id) ?? { average: null, count: 0 }]),
  );
  const savedIds = await savedProfileIds(supabase, user.id, otherIds);

  const results = pageRows.flatMap((r) => {
    const match = matchById.get(r.match_id);
    const other = otherById.get(r.other_profile_id);
    if (!match || !other) return [];
    return [
      {
        ...match,
        other,
        rating: ratingByProfileId.get(other.id) ?? { average: null, count: 0 },
        featured: r.featured,
        isSaved: savedIds.has(other.id),
      },
    ];
  });

  return NextResponse.json({ myRole: myProfile.role, results, total });
}
