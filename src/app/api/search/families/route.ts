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
  if (profile?.role !== "nanny") {
    return NextResponse.json({ error: "Only nanny accounts can search families" }, { status: 403 });
  }

  const { data: nannyProfile } = await supabase
    .from("nanny_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!nannyProfile) {
    return NextResponse.json({ error: "Create your profile before searching" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const minScore = Number(searchParams.get("minScore") ?? 60);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, score, score_breakdown, status, interest_expires_at, parent_profiles!inner(id, full_name, location_id, num_children, children_age_ranges, schedule_type, live_arrangement, salary_min, salary_max, transportation_required, additional_duties, family_description, locations(name_en, name_ar, name_fr), parent_profile_languages(language_id))",
    )
    .eq("nanny_profile_id", nannyProfile.id)
    .gte("score", minScore)
    .order("score", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ results: data });
}
