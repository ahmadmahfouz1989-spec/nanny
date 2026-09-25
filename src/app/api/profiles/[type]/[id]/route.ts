import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { ratingAggregateForUser } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";
import { savedProfileIds } from "@/lib/saved-profiles";

const NANNY_FIELDS =
  "id, user_id, full_name, profile_photo_url, location_detail, nationality, work_radius_km, employment_type, live_arrangement_pref, availability, years_experience, has_transportation, can_drive, certifications, short_intro, locations(name_en, name_ar, name_fr), nanny_profile_languages(languages(id, name_en, name_ar, name_fr)), nanny_experience(age_group, years_experience)";

const PARENT_FIELDS =
  "id, user_id, full_name, profile_photo_url, location_detail, nationality, num_children, children_age_ranges, schedule_type, needed_days, live_arrangement, desired_start_date, transportation_required, additional_duties, family_description, locations(name_en, name_ar, name_fr), parent_profile_languages(languages(id, name_en, name_ar, name_fr))";

const GENERIC_FIELDS =
  "id, user_id, full_name, profile_photo_url, role, location_id, attributes, category_id, locations(name_en, name_ar, name_fr), categories(name_en, name_ar)";

/**
 * A single profile, for viewing from a context that isn't a scored match
 * card (currently: clicking a name on a feed post, or a saved-profiles
 * card). Same visibility rules as everywhere else -- the request-scoped
 * client means RLS decides who can see it (your own profile, or an
 * active+approved one from the opposite role/a matching category), so
 * this can't leak anything a match card couldn't already show.
 */
export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (type !== "parent" && type !== "nanny" && type !== "generic") {
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
      : type === "nanny"
        ? await supabase.from("nanny_profiles").select(NANNY_FIELDS).eq("id", id).maybeSingle()
        : await supabase.from("generic_profiles").select(GENERIC_FIELDS).eq("id", id).maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const userId = (profile as unknown as { user_id: string }).user_id;
  const [rating, featured, saved] = await Promise.all([
    ratingAggregateForUser(userId),
    featuredUserIds([userId]),
    savedProfileIds(supabase, user.id, type, [id]),
  ]);

  // A generic profile stores its languages as bare ids inside attributes
  // (there's no join table like nanny/parent have) -- resolve them here so
  // the preview can show localized names instead of UUIDs.
  let languages: { id: string; name_en: string; name_ar: string; name_fr: string }[] = [];
  if (type === "generic") {
    const ids = (profile as unknown as { attributes: { languageIds?: unknown } | null }).attributes?.languageIds;
    const languageIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
    if (languageIds.length > 0) {
      const { data } = await supabase.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds);
      languages = data ?? [];
    }
  }

  return NextResponse.json({
    type,
    profile: type === "generic" ? { ...profile, languages } : profile,
    rating,
    featured: featured.has(userId),
    isSaved: saved.has(id),
  });
}
