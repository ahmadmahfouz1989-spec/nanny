import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeAreaText, rankAreaHits, type AreaHit } from "@/lib/areas";

const COLUMNS = "id, level, name_en, name_ar, search_text, parent_location_id";

/**
 * Lebanon's districts and areas (the imported ones -- those with a code):
 *   ?q=hamra            → up to 12 best matches, districts and areas, in
 *                         Arabic or English (everyday aliases included)
 *   ?governorate=<id>   → that governorate's districts
 *   ?district=<id>      → that district's areas
 *   ?id=<id>            → one district or area, to show a saved choice
 * Each comes with its parent and governorate, so picking an area also
 * fills in the district and governorate. Public data; no sign-in needed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();

  let rows: { id: string; level: string; name_en: string; name_ar: string; search_text: string | null; parent_location_id: string | null }[] = [];
  const q = normalizeAreaText(searchParams.get("q") ?? "").slice(0, 60);
  const governorate = searchParams.get("governorate");
  const district = searchParams.get("district");
  const id = searchParams.get("id");

  if (q) {
    // Every word typed has to appear; safe for the filter syntax because
    // only letters, digits and spaces survive normalization (plus Arabic).
    const words = q.split(" ").map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 5);
    let query = supabase.from("locations").select(COLUMNS).not("code", "is", null).in("level", ["district", "area"]);
    for (const w of words) query = query.ilike("search_text", `%${w}%`);
    const { data } = await query.limit(60);
    rows = rankAreaHits(data ?? [], q).slice(0, 12);
  } else if (governorate || district) {
    const { data } = await supabase
      .from("locations")
      .select(COLUMNS)
      .not("code", "is", null)
      .eq("parent_location_id", (governorate ?? district)!)
      .order(district ? "name_en" : "sort_order");
    rows = data ?? [];
  } else if (id) {
    const { data } = await supabase.from("locations").select(COLUMNS).eq("id", id).maybeSingle();
    rows = data ? [data] : [];
  }

  // Parents (district → governorate) for every row, in one more query.
  const parentIds = [...new Set(rows.map((r) => r.parent_location_id).filter((x): x is string => !!x))];
  const { data: parents } = parentIds.length
    ? await supabase.from("locations").select("id, level, name_en, name_ar, parent_location_id").in("id", parentIds)
    : { data: [] };
  const parentById = new Map((parents ?? []).map((p) => [p.id, p]));

  const hits: AreaHit[] = rows.map((r) => {
    const parent = r.parent_location_id ? parentById.get(r.parent_location_id) : undefined;
    const isArea = r.level === "area";
    return {
      id: r.id,
      level: r.level as AreaHit["level"],
      name_en: r.name_en,
      name_ar: r.name_ar,
      parent: parent ? { id: parent.id, name_en: parent.name_en, name_ar: parent.name_ar } : null,
      districtId: isArea ? (parent?.id ?? null) : r.level === "district" ? r.id : null,
      governorateId: isArea ? (parent?.parent_location_id ?? "") : r.level === "district" ? (r.parent_location_id ?? "") : r.id,
    };
  });

  return NextResponse.json({ areas: hits }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
