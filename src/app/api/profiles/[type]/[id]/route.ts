import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { ratingAggregateForUser } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";

const NANNY_FIELDS =
  "id, user_id, full_name, profile_photo_url, location_detail, nationality, work_radius_km, employment_type, live_arrangement_pref, availability, years_experience, has_transportation, can_drive, certifications, short_intro, locations(name_en, name_ar, name_fr), nanny_profile_languages(languages(id, name_en, name_ar, name_fr)), nanny_experience(age_group, years_experience)";

const PARENT_FIELDS =
  "id, user_id, full_name, profile_photo_url, location_detail, nationality, num_children, children_age_ranges, schedule_type, needed_days, live_arrangement, desired_start_date, transportation_required, additional_duties, family_description, locations(name_en, name_ar, name_fr), parent_profile_languages(languages(id, name_en, name_ar, name_fr))";

/**
 * A single profile, for viewing from a context that isn't a scored match
 * card (currently: clicking a name on a feed post). Same visibility rules
 * as everywhere else -- the request-scoped client means RLS decides who
 * can see it (your own profile, or an active+approved one from the
 * opposite role), so this can't leak anything a match card couldn't
 * already show.
 */
export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (type !== "parent" && type !== "nanny") {
    return NextResponse.json({ error: "Invalid profile type" }, { status: 400 });
  }

  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } =
    type === "parent"
      ? await supabase.from("parent_profiles").select(PARENT_FIELDS).eq("id", id).maybeSingle()
      : await supabase.from("nanny_profiles").select(NANNY_FIELDS).eq("id", id).maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const userId = (profile as unknown as { user_id: string }).user_id;
  const [rating, featured] = await Promise.all([ratingAggregateForUser(userId), featuredUserIds([userId])]);

  return NextResponse.json({ type, profile, rating, featured: featured.has(userId) });
}
