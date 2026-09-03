import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser } from "@/lib/ratings";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "parent") {
    return NextResponse.json({ error: "Only parent accounts can search nannies" }, { status: 403 });
  }

  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!parentProfile) {
    return NextResponse.json({ error: "Create your profile before searching" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, score, score_breakdown, status, interest_expires_at, nanny_profiles!inner(id, full_name, profile_photo_url, location_id, location_detail, work_radius_km, employment_type, live_arrangement_pref, availability, years_experience, has_transportation, can_drive, certifications, short_intro, locations(name_en, name_ar, name_fr), nanny_profile_languages(languages(id, name_en, name_ar, name_fr)), nanny_experience(age_group, years_experience))",
    )
    .eq("parent_profile_id", parentProfile.id)
    .order("score", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Attach each nanny's aggregate rating. The profile→user_id mapping stays
  // server-side (user_id is never part of the search response).
  const nannyProfileIds = (data ?? [])
    .map((r) => (r.nanny_profiles as unknown as { id: string } | null)?.id)
    .filter((v): v is string => Boolean(v));

  const ratingByProfileId = new Map<string, { average: number | null; count: number }>();
  if (nannyProfileIds.length > 0) {
    const admin = createAdminClient();
    const { data: owners } = await admin
      .from("nanny_profiles")
      .select("id, user_id")
      .in("id", nannyProfileIds);
    const aggregates = await ratingAggregatesByUser((owners ?? []).map((o) => o.user_id));
    for (const owner of owners ?? []) {
      ratingByProfileId.set(owner.id, aggregates.get(owner.user_id) ?? { average: null, count: 0 });
    }
  }

  const results = (data ?? []).map((r) => ({
    ...r,
    rating:
      ratingByProfileId.get((r.nanny_profiles as unknown as { id: string }).id) ?? {
        average: null,
        count: 0,
      },
  }));

  return NextResponse.json({ results });
}
