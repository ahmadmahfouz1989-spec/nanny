import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      "id, score, score_breakdown, status, interest_expires_at, nanny_profiles!inner(id, full_name, profile_photo_url, location_id, work_radius_km, employment_type, live_arrangement_pref, availability, years_experience, expected_salary_min, expected_salary_max, has_transportation, can_drive, certifications, short_intro, locations(name_en, name_ar, name_fr), nanny_profile_languages(languages(id, name_en, name_ar, name_fr)), nanny_experience(age_group, years_experience))",
    )
    .eq("parent_profile_id", parentProfile.id)
    .order("score", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ results: data });
}
