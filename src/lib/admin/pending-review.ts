import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, pendingReviewEmail } from "@/lib/email";
import { notify } from "@/lib/push";

type GenericRole = "seeker" | "provider";

const ROLE_LABEL: Record<GenericRole, { en: string; ar: string }> = {
  seeker: { en: "seeker", ar: "باحث عن الخدمة" },
  provider: { en: "provider", ar: "مقدّم الخدمة" },
};

/** Tells every admin a profile is waiting for review (bell, plus email unless they opted out). */
export async function notifyAdminsOfPendingReview(
  fullName: string,
  profileType: string,
  category: { name_en: string; name_ar: string },
  role: GenericRole,
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
      payload: { profile_type: profileType, full_name: fullName },
    })),
  );

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
