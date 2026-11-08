import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * What every account gives once, right after signing up ("About you"):
 * name, a phone number (the admins-only contact one, or the one they signed
 * up with), nationality and an optional photo. Service forms copy these
 * onto each profile instead of asking again.
 */
export type AccountBasics = {
  fullName: string | null;
  contactPhone: string | null;
  nationality: string | null;
  photoUrl: string | null;
  complete: boolean;
};

export async function accountBasics(db: Admin, userId: string): Promise<AccountBasics> {
  const { data } = await db.from("users").select("full_name, contact_phone, phone, nationality, photo_url").eq("id", userId).maybeSingle();
  const fullName = data?.full_name?.trim() || null;
  const contactPhone = data?.contact_phone?.trim() || data?.phone?.trim() || null;
  const nationality = data?.nationality || null;
  return { fullName, contactPhone, nationality, photoUrl: data?.photo_url ?? null, complete: !!(fullName && contactPhone && nationality) };
}

/** Where to send someone who hasn't given their basics yet, coming back to `next`. */
export const aboutYouHref = (next: string) => `/welcome/about-you?next=${encodeURIComponent(next)}`;
