import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, pendingReviewEmail } from "@/lib/email";
import { notify } from "@/lib/push";

type GenericRole = "seeker" | "provider";

const ROLE_LABEL: Record<GenericRole, { en: string; ar: string }> = {
  seeker: { en: "seeker", ar: "باحث عن الخدمة" },
  provider: { en: "provider", ar: "مقدّم الخدمة" },
};

/**
 * The status a provider's profile has after they change it. An approved
 * profile stays live -- admins are told to check the change and can take it
 * down -- so editing never makes a provider vanish from matches or orders.
 * A new or rejected one goes (back) to review.
 */
export const providerStatusAfterEdit = (current: string | null | undefined) => (current === "approved" ? "approved" : "pending");

/**
 * Tells every admin a profile is waiting for review (bell, plus email unless
 * they opted out). `edited`: a live profile changed -- the bell only, saying
 * so, and opening it among the approved ones.
 */
export async function notifyAdminsOfPendingReview(
  fullName: string,
  profileType: string,
  category: { name_en: string; name_ar: string },
  role: GenericRole,
  { edited = false }: { edited?: boolean } = {},
) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("users")
    .select("id, email, preferred_language, notify_new_profiles")
    .eq("role", "admin");

  if (!admins || admins.length === 0) return;

  // The in-app bell entry still goes to every admin -- only the email is
  // opt-out-able, per-admin (notify_new_profiles). Same convention as the
  // nanny/parent side in /api/profile/route.ts, which this mirrors --
  // this route used to skip the email entirely.
  await notify(
    admins.map((a) => ({
      user_id: a.id,
      type: "profile_pending_review" as const,
      payload: { profile_type: profileType, full_name: fullName, ...(edited ? { edited: true } : {}) },
    })),
  );
  if (edited) return;

  const kind = {
    en: `${category.name_en} · ${ROLE_LABEL[role].en}`,
    ar: `${category.name_ar} · ${ROLE_LABEL[role].ar}`,
  };

  await Promise.all(
    admins
      .filter((a) => a.email && a.notify_new_profiles)
      .map((a) => {
        const { subject, html } = pendingReviewEmail(a.preferred_language, fullName, kind);
        return sendEmail(a.email!, subject, html);
      }),
  );
}
