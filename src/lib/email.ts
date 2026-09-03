import { Resend } from "resend";
import nodemailer from "nodemailer";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL ?? "Link Lebanon <onboarding@resend.dev>";

// Fallback for when Resend has no verified domain: Resend's sandbox mode
// (the default until a domain is verified at resend.com/domains) only
// delivers to the account owner's own address, so any other recipient is
// silently rejected. Gmail SMTP has no such restriction and needs no
// domain — just a Gmail account and an App Password.
const smtpTransport =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      })
    : null;
const SMTP_FROM = process.env.SMTP_FROM ?? process.env.SMTP_USER;

const REPLY_TO = process.env.EMAIL_REPLY_TO || undefined;
const UNSUBSCRIBE = process.env.EMAIL_UNSUBSCRIBE || undefined;

// Extra headers that help deliverability: a real Reply-To (not noreply@)
// and, when configured, List-Unsubscribe.
function extraHeaders(): Record<string, string> | undefined {
  if (!UNSUBSCRIBE) return undefined;
  const headers: Record<string, string> = { "List-Unsubscribe": `<${UNSUBSCRIBE}>` };
  if (UNSUBSCRIBE.startsWith("https://")) {
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return headers;
}

// Wrap a template's inner HTML in a real document — a bare run of <p> tags
// with no <!doctype>/<html> and no text/plain part scores as spam.
function wrapHtml(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f1ea;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#241d15;"><tr><td><div style="font-weight:700;font-size:18px;color:#ee4f26;margin-bottom:16px;">Link Lebanon</div>${inner}</td></tr></table></td></tr></table></body></html>`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendViaResend(to: string, subject: string, html: string, text: string) {
  if (!resend) return false;
  try {
    // The Resend SDK resolves with { data: null, error } on API-level
    // failures (bad API key, unverified from-address, etc.) rather than
    // throwing — has to be checked explicitly or a real failure looks
    // identical to success.
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      ...(extraHeaders() ? { headers: extraHeaders() } : {}),
    });
    if (error) {
      console.error(`[email] Resend rejected email to ${to}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Resend failed to send to ${to}:`, err);
    return false;
  }
}

async function sendViaSmtp(to: string, subject: string, html: string, text: string) {
  if (!smtpTransport) return false;
  try {
    await smtpTransport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: extraHeaders(),
    });
    return true;
  } catch (err) {
    console.error(`[email] SMTP failed to send to ${to}:`, err);
    return false;
  }
}

/**
 * No-ops (logs and returns) when neither provider is configured, so the
 * app works the same with or without email set up — nothing in the calling
 * code needs to branch on whether email is enabled. Tries Resend first
 * (so it takes over automatically once a domain is verified there) and
 * falls back to Gmail SMTP on any failure.
 */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!resend && !smtpTransport) {
    console.log(`[email] no email provider configured — skipping email to ${to}: ${subject}`);
    return;
  }
  const doc = wrapHtml(html);
  const text = htmlToText(html);
  if (await sendViaResend(to, subject, doc, text)) return;
  await sendViaSmtp(to, subject, doc, text);
}

type Lang = "en" | "ar" | "fr" | null | undefined;

function pick(lang: Lang, en: string, ar: string) {
  return lang === "ar" ? ar : en;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function newSignupAdminEmail(lang: Lang, newUserRole: string, newUserEmail: string) {
  const kind = pick(
    lang,
    newUserRole === "nanny" ? "nanny" : "parent",
    newUserRole === "nanny" ? "مربية" : "أحد الوالدين",
  );
  const addr = escapeHtml(newUserEmail);
  return {
    subject: pick(lang, `New ${kind} sign-up`, `تسجيل جديد: ${kind}`),
    html: pick(
      lang,
      `<p>A new ${kind} just signed up: <strong>${addr}</strong>.</p><p>Their profile will show up in the moderation queue once they finish onboarding.</p>`,
      `<p>سجّل ${kind} جديد للتو: <strong>${addr}</strong>.</p><p>سيظهر ملفه في قائمة المراجعة بعد إكمال الإعداد.</p>`,
    ),
  };
}

export function interestReceivedEmail(lang: Lang, fromName: string) {
  return {
    subject: pick(lang, "Someone is interested in connecting", "شخص ما مهتم بالتواصل معك"),
    html: pick(
      lang,
      `<p>${fromName} is interested in connecting with you on Link Lebanon.</p><p>Log in to view the match and respond.</p>`,
      `<p>${fromName} مهتم/ة بالتواصل معك على Link Lebanon.</p><p>سجّل الدخول لعرض التطابق والرد عليه.</p>`,
    ),
  };
}

export function alreadyRegisteredEmail(lang: Lang, loginUrl: string, recoverUrl: string) {
  return {
    subject: pick(lang, "You already have an account", "لديك حساب بالفعل"),
    html: pick(
      lang,
      `<p>Someone just tried to sign up with this email, but you already have a Link Lebanon account.</p><p><a href="${loginUrl}">Log in</a> or <a href="${recoverUrl}">reset your password</a> if you forgot it.</p><p>If this wasn't you, you can safely ignore this email.</p>`,
      `<p>حاول شخص ما للتو إنشاء حساب بهذا البريد الإلكتروني، لكن لديك حساب على Link Lebanon بالفعل.</p><p><a href="${loginUrl}">سجّل الدخول</a> أو <a href="${recoverUrl}">أعد تعيين كلمة المرور</a> إذا نسيتها.</p><p>إذا لم يكن هذا أنت، يمكنك تجاهل هذا البريد بأمان.</p>`,
    ),
  };
}

export function newMessageEmail(lang: Lang, fromName: string, snippet: string, messagesUrl: string) {
  const name = escapeHtml(fromName);
  const body = escapeHtml(snippet);
  return {
    // Subject is rendered as plain text by mail clients — use the raw name.
    subject: pick(lang, `New message from ${fromName}`, `رسالة جديدة من ${fromName}`),
    html: pick(
      lang,
      `<p>${name} sent you a message on Link Lebanon:</p><blockquote style="margin:0;padding:8px 12px;border-inline-start:3px solid #ddd;color:#555">${body}</blockquote><p><a href="${messagesUrl}">Open the conversation</a> to reply.</p><p style="color:#888;font-size:13px">We'll only email you once per conversation until you've read it.</p>`,
      `<p>أرسل/أرسلت ${name} رسالة إليك على Link Lebanon:</p><blockquote style="margin:0;padding:8px 12px;border-inline-start:3px solid #ddd;color:#555">${body}</blockquote><p><a href="${messagesUrl}">افتح المحادثة</a> للرد.</p><p style="color:#888;font-size:13px">سنرسل لك بريدًا واحدًا فقط لكل محادثة حتى تقرأها.</p>`,
    ),
  };
}

export function mutualMatchEmail(lang: Lang, otherName: string, matchUrl: string) {
  const name = escapeHtml(otherName);
  return {
    subject: pick(lang, "It's a match!", "لقد تطابقتما!"),
    html: pick(
      lang,
      `<p>You and ${name} are both interested — it's a match!</p><p>Contact details are unlocked and you can now message each other. <a href="${matchUrl}">Log in to view the match and start chatting</a>.</p>`,
      `<p>أنت و${name} مهتمّان ببعضكما — لقد تطابقتما!</p><p>تم فتح معلومات التواصل ويمكنكما الآن مراسلة بعضكما. <a href="${matchUrl}">سجّل الدخول لعرض التطابق وبدء المحادثة</a>.</p>`,
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
      `<p>Welcome to Link Lebanon — click below to confirm your email and activate your account.</p><p><a href="${confirmUrl}">Confirm email</a></p><p>If you didn't create this account, you can ignore this email.</p>`,
      `<p>مرحبًا بك في Link Lebanon — اضغط أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.</p><p><a href="${confirmUrl}">تأكيد البريد الإلكتروني</a></p><p>إذا لم تُنشئ هذا الحساب، يمكنك تجاهل هذا البريد.</p>`,
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
