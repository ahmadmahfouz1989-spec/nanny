import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { ratingAggregateForUser } from "@/lib/ratings";
import { featuredUserIds } from "@/lib/featured";
import { savedProfileIds } from "@/lib/saved-profiles";

const FIELDS =
  "id, user_id, full_name, profile_photo_url, role, location_id, attributes, category_id, locations(name_en, name_ar, name_fr), categories(slug, name_en, name_ar)";

/**
 * A single profile, for viewing from a context that isn't a scored match
 * card (a name on a feed post, a saved-profiles card, a conversation
 * header). Same visibility rules as everywhere else -- the request-scoped
 * client means RLS decides who can see it (your own profile, an active and
 * approved one, or a mutual match's), so this can't leak anything a match
 * card couldn't already show.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("generic_profiles").select(FIELDS).eq("id", id).maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // user_id is only used server-side, same as the match lists.
  const { user_id: ownerId, ...visible } = profile;
  const [rating, featured, saved] = await Promise.all([
    ratingAggregateForUser(ownerId),
    featuredUserIds([ownerId]),
    savedProfileIds(supabase, user.id, [id]),
  ]);

  // Languages are stored as bare ids inside attributes -- resolve them here
  // so the preview can show localized names instead of UUIDs.
  const ids = (profile.attributes as { languageIds?: unknown } | null)?.languageIds;
  const languageIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  const { data: languages } =
    languageIds.length > 0
      ? await supabase.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds)
      : { data: [] };

  return NextResponse.json({
    profile: { ...visible, languages: languages ?? [] },
    rating,
    featured: featured.has(ownerId),
    isSaved: saved.has(id),
  });
}
