import { createAdminClient } from "@/lib/supabase/admin";
import { asAttributes } from "@/lib/attributes";
import { searchableText } from "@/lib/profile-search";

const BATCH = 200;

/**
 * Recomputes and stores generic_profiles.search_text for these profiles --
 * after a profile is saved, and for any profile still missing it (see
 * fillMissingSearchText). Service role: it's derived data the owner doesn't
 * write directly.
 */
export async function refreshSearchText(profileIds: string[]) {
  const admin = createAdminClient();
  for (let i = 0; i < profileIds.length; i += BATCH) {
    const { data: profiles } = await admin
      .from("generic_profiles")
      .select("id, full_name, attributes, locations(name_en, name_ar, name_fr)")
      .in("id", profileIds.slice(i, i + BATCH));
    if (!profiles?.length) continue;

    const languageIds = [
      ...new Set(
        profiles.flatMap((p) => {
          const ids = asAttributes(p.attributes).languageIds;
          return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
        }),
      ),
    ];
    const { data: languages } = languageIds.length
      ? await admin.from("languages").select("id, name_en, name_ar, name_fr").in("id", languageIds)
      : { data: [] };
    const languageById = new Map((languages ?? []).map((l) => [l.id, l]));

    await Promise.all(
      profiles.map((p) => {
        const attributes = asAttributes(p.attributes);
        const ids = Array.isArray(attributes.languageIds) ? attributes.languageIds : [];
        const text = searchableText({
          full_name: p.full_name,
          attributes,
          locations: p.locations,
          languages: ids.map((id) => languageById.get(id as string)),
        });
        return admin.from("generic_profiles").update({ search_text: text }).eq("id", p.id);
      }),
    );
  }
}

/**
 * Fills in search_text for any profile in a category that doesn't have it
 * yet (profiles saved before it existed). Cheap no-op once they all do.
 */
export async function fillMissingSearchText(categoryId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("generic_profiles")
    .select("id")
    .eq("category_id", categoryId)
    .is("search_text", null)
    .neq("status", "draft")
    .limit(1000);
  if (data?.length) await refreshSearchText(data.map((p) => p.id));
}
