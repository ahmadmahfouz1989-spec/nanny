import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";
import { savedProfileIds } from "@/lib/saved-profiles";

/**
 * Lists matches for the caller's own generic_profiles row in a category --
 * the generic-category equivalent of /api/search/nannies /
 * /api/search/families.
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

  const column = myProfile.role === "seeker" ? "seeker_profile_id" : "provider_profile_id";
  const otherIdOf = (m: { seeker_profile_id: string; provider_profile_id: string }) =>
    myProfile.role === "seeker" ? m.provider_profile_id : m.seeker_profile_id;

  // Two plain queries rather than an embedded select: generic_matches has
  // two FKs to generic_profiles, and PostgREST's `!column` disambiguation
  // hint for that case can't be verified against a live project here.
  // Selecting both id columns (rather than just "the other one") also
  // sidesteps a template-literal select producing a union return type.
  const { data: matches, error } = await supabase
    .from("generic_matches")
    .select("id, score, score_breakdown, status, interest_expires_at, seeker_profile_id, provider_profile_id")
    .eq(column, myProfile.id)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  type OtherProfile = {
    id: string;
    full_name: string;
    location_id: string | null;
    attributes: Record<string, unknown>;
    locations: { name_en: string; name_ar: string; name_fr: string } | null;
  };

  const otherIds = (matches ?? []).map(otherIdOf);
  const { data: otherProfiles } =
    otherIds.length > 0
      ? await supabase
          .from("generic_profiles")
          .select("id, full_name, location_id, attributes, locations(name_en, name_ar, name_fr)")
          .in("id", otherIds)
      : { data: [] as OtherProfile[] };

  const otherById = new Map((otherProfiles ?? []).map((p) => [p.id, p]));

  // Attach each counterpart's aggregate rating and Featured status -- the
  // profile→user_id mapping stays server-side (user_id is never part of
  // the response), same pattern as /api/search/nannies.
  const ratingByProfileId = new Map<string, { average: number | null; count: number }>();
  const featuredProfileIds = new Set<string>();
  if (otherIds.length > 0) {
    const admin = createAdminClient();
    const { data: owners } = await admin.from("generic_profiles").select("id, user_id").in("id", otherIds);
    const [aggregates, featuredUsers] = await Promise.all([
      ratingAggregatesByUser((owners ?? []).map((o) => o.user_id)),
      featuredUserIds((owners ?? []).map((o) => o.user_id)),
    ]);
    for (const owner of owners ?? []) {
      ratingByProfileId.set(owner.id, aggregates.get(owner.user_id) ?? { average: null, count: 0 });
      if (featuredUsers.has(owner.user_id)) featuredProfileIds.add(owner.id);
    }
  }

  const savedIds = await savedProfileIds(supabase, user.id, "generic", otherIds);

  const results = (matches ?? []).map((m) => {
    const otherId = otherIdOf(m);
    return {
      ...m,
      other: otherById.get(otherId) ?? null,
      rating: ratingByProfileId.get(otherId) ?? { average: null, count: 0 },
      featured: featuredProfileIds.has(otherId),
      isSaved: savedIds.has(otherId),
    };
  });

  // Manual overrides on top of the algorithm's score order, same as
  // /api/search/nannies -- narrows the already-complete match set rather
  // than querying a separate index. availability lives under different
  // attribute keys depending on category/role (availability.days vs
  // neededDays), so both are checked.
  const governorateId = searchParams.get("governorateId");
  const day = searchParams.get("day");
  const minYearsExperience = searchParams.get("minYearsExperience");

  const filtered = results.filter((r) => {
    if (!r.other) return false;
    const a = r.other.attributes ?? {};
    if (governorateId && r.other.location_id !== governorateId) return false;
    if (day) {
      const days = ((a.availability as { days?: string[] } | undefined)?.days ?? a.neededDays ?? []) as string[];
      if (!days.includes(day)) return false;
    }
    if (minYearsExperience && !(typeof a.yearsExperience === "number" && a.yearsExperience >= Number(minYearsExperience))) {
      return false;
    }
    return true;
  });

  return NextResponse.json({ myRole: myProfile.role, results: filtered, total: filtered.length });
}
