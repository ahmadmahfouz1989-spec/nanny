import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PostIdentityType = "parent" | "nanny" | "generic";

export type PostIdentityOption = {
  type: PostIdentityType;
  profileId: string;
  fullName: string;
  photoUrl: string | null;
  categoryNameEn?: string;
  categoryNameAr?: string;
  genericRole?: "seeker" | "provider";
};

/**
 * Every identity a user could post the feed under -- their nanny/parent
 * profile if they have one (and it's not an abandoned draft), plus every
 * non-draft generic_profiles row (nursing, tutoring, ...) they hold.
 * Nanny/parent first, then generics oldest-first: resolveDefaultPostIdentity
 * below leans on that order for its own fallback.
 */
export async function listPostIdentities(supabase: Supabase, userId: string): Promise<PostIdentityOption[]> {
  const identities: PostIdentityOption[] = [];

  const { data: userRow } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();

  if (userRow?.role === "parent" || userRow?.role === "nanny") {
    const table = userRow.role === "parent" ? "parent_profiles" : "nanny_profiles";
    const { data: profile } = await supabase
      .from(table)
      .select("id, full_name, profile_photo_url, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile && profile.status !== "draft") {
      identities.push({
        type: userRow.role,
        profileId: profile.id,
        fullName: profile.full_name,
        photoUrl: profile.profile_photo_url,
      });
    }
  }

  const { data: generics } = await supabase
    .from("generic_profiles")
    .select("id, full_name, profile_photo_url, role, status, created_at, categories(name_en, name_ar)")
    .eq("user_id", userId)
    .neq("status", "draft")
    .order("created_at", { ascending: true });

  for (const g of generics ?? []) {
    const category = g.categories as unknown as { name_en: string; name_ar: string } | null;
    identities.push({
      type: "generic",
      profileId: g.id,
      fullName: g.full_name,
      photoUrl: g.profile_photo_url,
      categoryNameEn: category?.name_en,
      categoryNameAr: category?.name_ar,
      genericRole: g.role as "seeker" | "provider",
    });
  }

  return identities;
}

/**
 * Which identity to preselect in the composer: whatever the account most
 * recently posted as, if that identity is still eligible today, else the
 * first entry in `identities` (nanny/parent if present, else the oldest
 * generic profile) -- the same effective default the legacy display logic
 * already produces for a first-time poster.
 */
export async function resolveDefaultPostIdentity(
  supabase: Supabase,
  userId: string,
  identities: PostIdentityOption[],
): Promise<{ type: PostIdentityType; profileId: string } | null> {
  if (identities.length === 0) return null;

  const { data: lastPost } = await supabase
    .from("posts")
    .select("posted_as_parent_profile_id, posted_as_nanny_profile_id, posted_as_generic_profile_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastUsed: { type: PostIdentityType; profileId: string } | null = lastPost?.posted_as_parent_profile_id
    ? { type: "parent", profileId: lastPost.posted_as_parent_profile_id }
    : lastPost?.posted_as_nanny_profile_id
      ? { type: "nanny", profileId: lastPost.posted_as_nanny_profile_id }
      : lastPost?.posted_as_generic_profile_id
        ? { type: "generic", profileId: lastPost.posted_as_generic_profile_id }
        : null;

  if (lastUsed && identities.some((i) => i.type === lastUsed.type && i.profileId === lastUsed.profileId)) {
    return lastUsed;
  }

  const first = identities[0]!;
  return { type: first.type, profileId: first.profileId };
}
