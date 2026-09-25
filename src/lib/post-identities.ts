import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PostIdentityOption = {
  profileId: string;
  fullName: string;
  photoUrl: string | null;
  categoryNameEn?: string;
  categoryNameAr?: string;
  role: "seeker" | "provider";
};

/**
 * Every identity a user could post the feed under: each non-draft profile
 * they hold, in any category, oldest first -- resolveDefaultPostIdentity
 * below leans on that order for its own fallback.
 */
export async function listPostIdentities(supabase: Supabase, userId: string): Promise<PostIdentityOption[]> {
  const { data: profiles } = await supabase
    .from("generic_profiles")
    .select("id, full_name, profile_photo_url, role, created_at, categories(name_en, name_ar)")
    .eq("user_id", userId)
    .neq("status", "draft")
    .order("created_at", { ascending: true });

  return (profiles ?? []).map((g) => {
    const category = g.categories as unknown as { name_en: string; name_ar: string } | null;
    return {
      profileId: g.id,
      fullName: g.full_name,
      photoUrl: g.profile_photo_url,
      categoryNameEn: category?.name_en,
      categoryNameAr: category?.name_ar,
      role: g.role as "seeker" | "provider",
    };
  });
}

/**
 * Which identity to preselect in the composer: whatever the account most
 * recently posted as, if that identity is still eligible today, else its
 * oldest profile.
 */
export async function resolveDefaultPostIdentity(
  supabase: Supabase,
  userId: string,
  identities: PostIdentityOption[],
): Promise<{ profileId: string } | null> {
  if (identities.length === 0) return null;

  const { data: lastPost } = await supabase
    .from("posts")
    .select("posted_as_generic_profile_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastUsed = lastPost?.posted_as_generic_profile_id;
  if (lastUsed && identities.some((i) => i.profileId === lastUsed)) {
    return { profileId: lastUsed };
  }

  return { profileId: identities[0]!.profileId };
}
