import type { User } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * A verified phone before someone's first profile, so the same person can't
 * end up with a second account. Off until NEXT_PUBLIC_REQUIRE_VERIFIED_PHONE
 * is "on", and it can only work where WhatsApp codes are being sent.
 */
export const PHONE_REQUIRED =
  process.env.NEXT_PUBLIC_REQUIRE_VERIFIED_PHONE === "on" && process.env.NEXT_PUBLIC_WHATSAPP_AUTH === "on";

/** Anyone who already has a profile carries on as before. */
export async function mustVerifyPhone(db: ReturnType<typeof createAdminClient>, user: User): Promise<boolean> {
  if (!PHONE_REQUIRED || user.phone_confirmed_at) return false;
  const { data } = await db.from("generic_profiles").select("id").eq("user_id", user.id).neq("status", "draft").limit(1).maybeSingle();
  return !data;
}
