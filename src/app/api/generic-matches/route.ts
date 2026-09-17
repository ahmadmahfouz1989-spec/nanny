import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Lists matches for the caller's own generic_profiles row in a category --
 * the generic-category equivalent of /api/search/nannies /
 * /api/search/families. No pagination/rating/featured layer yet (see the
 * plan's v1 messaging scope note); this is intentionally the minimal
 * version of those richer nanny-side endpoints.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: myProfile } = await supabase
    .from("generic_profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .maybeSingle();

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

  const otherIds = (matches ?? []).map(otherIdOf);
  const { data: otherProfiles } =
    otherIds.length > 0
      ? await supabase
          .from("generic_profiles")
          .select("id, full_name, location_id, attributes, locations(name_en, name_ar, name_fr)")
          .in("id", otherIds)
      : { data: [] as { id: string }[] };

  const otherById = new Map((otherProfiles ?? []).map((p) => [p.id, p]));
  const results = (matches ?? []).map((m) => ({ ...m, other: otherById.get(otherIdOf(m)) ?? null }));

  return NextResponse.json({ myRole: myProfile.role, results });
}
