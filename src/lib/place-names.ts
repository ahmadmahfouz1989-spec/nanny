import { createAdminClient } from "@/lib/supabase/admin";

type Name = { name_en: string; name_ar: string; name_fr: string };
type WithPlace = { attributes?: unknown; locations?: Name | Name[] | null };

/**
 * Swaps each profile's `locations` (its governorate) for the most precise
 * place it has: "Ras Beyrouth, Beirut" for an area, "Baabda" for a
 * district -- so cards, search results and profile pages say where
 * someone actually is. Profiles from before districts keep their
 * governorate. Locations are public reference data.
 */
export async function withPlaceNames<T extends WithPlace>(rows: T[]): Promise<T[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    const a = (r.attributes ?? {}) as Record<string, unknown>;
    if (typeof a.areaId === "string") ids.add(a.areaId);
    if (typeof a.districtId === "string") ids.add(a.districtId);
  }
  if (ids.size === 0) return rows;

  const { data } = await createAdminClient().from("locations").select("id, name_en, name_ar, name_fr").in("id", [...ids]);
  const byId = new Map((data ?? []).map((l) => [l.id, l]));

  return rows.map((r) => {
    const a = (r.attributes ?? {}) as Record<string, unknown>;
    const area = typeof a.areaId === "string" ? byId.get(a.areaId) : undefined;
    const district = typeof a.districtId === "string" ? byId.get(a.districtId) : undefined;
    if (!area && !district) return r;
    // An area named like its district ("Baabda, Baabda") says it once.
    const join = (x?: string, y?: string) => [x, y].filter((v, i, all) => v && all.indexOf(v) === i).join(", ");
    const place: Name = {
      name_en: join(area?.name_en, district?.name_en),
      name_ar: join(area?.name_ar, district?.name_ar),
      name_fr: join(area?.name_fr, district?.name_fr),
    };
    return { ...r, locations: place };
  });
}
