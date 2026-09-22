import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser } from "@/lib/ratings";
import { featuredProfileIds } from "@/lib/featured";

type ParentProfile = {
  id: string;
  location_id: string | null;
  schedule_type: string;
  live_arrangement: string;
  needed_days?: string[] | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);

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
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const governorateId = searchParams.get("governorateId");
  const day = searchParams.get("day");
  const scheduleType = searchParams.get("scheduleType");
  const liveArrangement = searchParams.get("liveArrangement");

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, score, score_breakdown, status, interest_expires_at, parent_profiles!inner(id, full_name, profile_photo_url, location_id, location_detail, nationality, num_children, children_age_ranges, schedule_type, live_arrangement, needed_days, desired_start_date, transportation_required, additional_duties, family_description, locations(name_en, name_ar, name_fr), parent_profile_languages(languages(id, name_en, name_ar, name_fr)))",
    )
    .eq("nanny_profile_id", nannyProfile.id)
    .order("score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const filtered = (data ?? []).filter((r) => {
    const parent = r.parent_profiles as unknown as ParentProfile;
    if (governorateId && parent.location_id !== governorateId) return false;
    if (day && !(parent.needed_days ?? []).includes(day)) return false;
    if (scheduleType && parent.schedule_type !== scheduleType) return false;
    if (liveArrangement && parent.live_arrangement !== liveArrangement) return false;
    return true;
  });

  // Featured has to be known -- and applied -- before slicing to a page,
  // or a Featured family ranked below the page cutoff by score alone would
  // never surface. Array#sort is stable, so this only pulls Featured
  // profiles forward and leaves the existing score order within each group.
  const allParentProfileIds = filtered
    .map((r) => (r.parent_profiles as unknown as { id: string } | null)?.id)
    .filter((v): v is string => Boolean(v));
  const allFeaturedIds = await featuredProfileIds("parent", allParentProfileIds);
  filtered.sort((a, b) => {
    const aId = (a.parent_profiles as unknown as { id: string } | null)?.id;
    const bId = (b.parent_profiles as unknown as { id: string } | null)?.id;
    return Number(bId && allFeaturedIds.has(bId)) - Number(aId && allFeaturedIds.has(aId));
  });

  const from = (page - 1) * pageSize;
  const paged = filtered.slice(from, from + pageSize);

  // Attach each family's aggregate rating. The profile→user_id mapping
  // stays server-side (user_id is never part of the search response).
  const parentProfileIds = paged
    .map((r) => (r.parent_profiles as unknown as { id: string } | null)?.id)
    .filter((v): v is string => Boolean(v));

  const ratingByProfileId = new Map<string, { average: number | null; count: number }>();
  if (parentProfileIds.length > 0) {
    const admin = createAdminClient();
    const { data: owners } = await admin
      .from("parent_profiles")
      .select("id, user_id")
      .in("id", parentProfileIds);
    const aggregates = await ratingAggregatesByUser((owners ?? []).map((o) => o.user_id));
    for (const owner of owners ?? []) {
      ratingByProfileId.set(owner.id, aggregates.get(owner.user_id) ?? { average: null, count: 0 });
    }
  }

  const results = paged.map((r) => {
    const id = (r.parent_profiles as unknown as { id: string }).id;
    return {
      ...r,
      rating: ratingByProfileId.get(id) ?? { average: null, count: 0 },
      featured: allFeaturedIds.has(id),
    };
  });

  return NextResponse.json({ results, total: filtered.length });
}
