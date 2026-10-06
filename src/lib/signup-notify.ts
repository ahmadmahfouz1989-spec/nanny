import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, newSignupAdminEmail } from "@/lib/email";

/**
 * Emails every admin (who hasn't muted it) that a genuinely new account was
 * created -- identified by its email or, for WhatsApp sign-ups, its phone
 * number. Best-effort: a failure here must never break a sign-up.
 */
export async function notifyAdminsOfNewSignup(identifier: string) {
  try {
    const admin = createAdminClient();
    const { data: admins } = await admin
      .from("users")
      .select("email, preferred_language, notify_new_profiles")
      .eq("role", "admin");

    // Same opt-out as the pending-review email -- an admin who's muted new
    // profiles doesn't want the even-earlier "someone just signed up" email
    // either.
    await Promise.all(
      (admins ?? [])
        .filter((a) => a.email && a.notify_new_profiles)
        .map((a) => {
          const { subject, html } = newSignupAdminEmail(a.preferred_language, identifier);
          return sendEmail(a.email!, subject, html);
        }),
    );
  } catch (err) {
    console.error("[signup] admin new-signup email failed:", err);
  }
}
