import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "nanny <onboarding@resend.dev>";

/**
 * No-ops (logs and returns) when RESEND_API_KEY isn't configured, so the
 * app works the same with or without email set up — nothing in the calling
 * code needs to branch on whether email is enabled.
 */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set — skipping email to ${to}: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Notification email failures shouldn't break the underlying action
    // (approval, interest, etc.) — log and move on.
    console.error(`[email] failed to send to ${to}:`, err);
  }
}

type Lang = "en" | "ar" | "fr" | null | undefined;

function pick(lang: Lang, en: string, ar: string) {
  return lang === "ar" ? ar : en;
}

export function pendingReviewEmail(lang: Lang, profileName: string, profileType: "parent" | "nanny") {
  const kind = pick(lang, profileType === "parent" ? "parent" : "nanny", profileType === "parent" ? "أحد الوالدين" : "مربية");
  return {
    subject: pick(lang, "New profile awaiting review", "ملف جديد بانتظار المراجعة"),
    html: pick(
      lang,
      `<p>${profileName} (${kind}) just submitted a profile for review.</p><p>Head to the admin console to approve or reject it.</p>`,
      `<p>قام/قامت ${profileName} (${kind}) بإرسال ملف شخصي للمراجعة.</p><p>توجّه إلى لوحة الإدارة للموافقة عليه أو رفضه.</p>`,
    ),
  };
}

export function interestReceivedEmail(lang: Lang, fromName: string) {
  return {
    subject: pick(lang, "Someone is interested in connecting", "شخص ما مهتم بالتواصل معك"),
    html: pick(
      lang,
      `<p>${fromName} is interested in connecting with you on nanny.</p><p>Log in to view the match and respond.</p>`,
      `<p>${fromName} مهتم/ة بالتواصل معك على تطبيق nanny.</p><p>سجّل الدخول لعرض التطابق والرد عليه.</p>`,
    ),
  };
}

export function alreadyRegisteredEmail(lang: Lang, loginUrl: string, recoverUrl: string) {
  return {
    subject: pick(lang, "You already have an account", "لديك حساب بالفعل"),
    html: pick(
      lang,
      `<p>Someone just tried to sign up with this email, but you already have a nanny account.</p><p><a href="${loginUrl}">Log in</a> or <a href="${recoverUrl}">reset your password</a> if you forgot it.</p><p>If this wasn't you, you can safely ignore this email.</p>`,
      `<p>حاول شخص ما للتو إنشاء حساب بهذا البريد الإلكتروني، لكن لديك حساب على nanny بالفعل.</p><p><a href="${loginUrl}">سجّل الدخول</a> أو <a href="${recoverUrl}">أعد تعيين كلمة المرور</a> إذا نسيتها.</p><p>إذا لم يكن هذا أنت، يمكنك تجاهل هذا البريد بأمان.</p>`,
    ),
  };
}

export function mutualMatchEmail(lang: Lang, otherName: string) {
  return {
    subject: pick(lang, "It's a match!", "لقد تطابقتما!"),
    html: pick(
      lang,
      `<p>You and ${otherName} are both interested — contact details are now unlocked.</p><p>Log in to view them.</p>`,
      `<p>أنتما مهتمّان ببعضكما البعض — تم إلغاء قفل معلومات التواصل الآن.</p><p>سجّل الدخول لعرضها.</p>`,
    ),
  };
}

// Sent via Supabase's Send Email auth hook (src/app/api/auth/email-hook),
// which fully replaces Supabase's own email delivery for these flows.
export function signupConfirmationEmail(lang: Lang, confirmUrl: string) {
  return {
    subject: pick(lang, "Confirm your email", "أكّد بريدك الإلكتروني"),
    html: pick(
      lang,
      `<p>Welcome to nanny — click below to confirm your email and activate your account.</p><p><a href="${confirmUrl}">Confirm email</a></p><p>If you didn't create this account, you can ignore this email.</p>`,
      `<p>مرحبًا بك في nanny — اضغط أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.</p><p><a href="${confirmUrl}">تأكيد البريد الإلكتروني</a></p><p>إذا لم تُنشئ هذا الحساب، يمكنك تجاهل هذا البريد.</p>`,
    ),
  };
}

export function passwordRecoveryEmail(lang: Lang, resetUrl: string) {
  return {
    subject: pick(lang, "Reset your password", "إعادة تعيين كلمة المرور"),
    html: pick(
      lang,
      `<p>Click below to choose a new password.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      `<p>اضغط أدناه لاختيار كلمة مرور جديدة.</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد بأمان — لن تتغيّر كلمة مرورك.</p>`,
    ),
  };
}

export function genericAuthEmail(lang: Lang, actionType: string, actionUrl: string) {
  return {
    subject: pick(lang, "Confirm this action", "تأكيد هذا الإجراء"),
    html: pick(
      lang,
      `<p>Click below to confirm: ${actionType}.</p><p><a href="${actionUrl}">Confirm</a></p>`,
      `<p>اضغط أدناه للتأكيد: ${actionType}.</p><p><a href="${actionUrl}">تأكيد</a></p>`,
    ),
  };
}
