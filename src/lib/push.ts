import { after } from "next/server";
import webpush from "web-push";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationHref, notificationLabel } from "@/lib/notification-content";
import type { Json } from "@/lib/supabase/database.types";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

/**
 * Web push to every device a user turned notifications on for (rows in
 * push_subscriptions, written by /api/push/subscription). Off unless the
 * VAPID keys are set -- generate a pair with `npx web-push generate-vapid-keys`.
 * Always best-effort: a push failure never fails the action that caused it.
 */

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
// Contact the push services may use (must be mailto: or https://); falls
// back to the public site URL.
const appUrl = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : null;
const subject = process.env.VAPID_SUBJECT || appUrl || "https://ouiknow.com";

export function pushEnabled() {
  return !!publicKey && !!privateKey;
}

type Locale = "en" | "ar";
const MESSAGES = { en, ar };

export type PushMessage = {
  title: string;
  body: string;
  /** Locale-prefixed path the notification opens. */
  url: string;
  /** Same tag replaces the earlier notification instead of stacking. */
  tag?: string;
};

/** Sends to all of these users' devices, building the text per device language. */
export async function sendPush(userIds: string[], build: (locale: Locale) => PushMessage) {
  if (!pushEnabled() || userIds.length === 0) return;

  try {
    webpush.setVapidDetails(subject, publicKey!, privateKey!);
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, locale")
      .in("user_id", [...new Set(userIds)]);

    const gone: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        const locale: Locale = s.locale === "ar" ? "ar" : "en";
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(build(locale)),
            { TTL: 60 * 60 * 24, urgency: "high" },
          );
        } catch (err) {
          // 404/410: the browser dropped this subscription (app uninstalled,
          // permission revoked) -- forget it so we stop sending.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          else console.error("[push] send failed:", status ?? err);
        }
      }),
    );

    if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
  } catch (err) {
    console.error("[push] failed:", err);
  }
}

/**
 * Same as sendPush, but runs after the response is sent. Outside a request
 * (scripts, tests) after() throws, so it just sends in the background.
 */
export function sendPushAfterResponse(userIds: string[], build: (locale: Locale) => PushMessage) {
  if (!pushEnabled() || userIds.length === 0) return;
  try {
    after(() => sendPush(userIds, build));
  } catch {
    void sendPush(userIds, build);
  }
}

/** Untyped-key translator, the same shape the bell gets from useTranslations. */
export function pushTranslator(locale: Locale, namespace: "Notifications" | "Push") {
  const t = createTranslator({ locale, messages: MESSAGES[locale] as AbstractIntlMessages, namespace });
  return t as unknown as (key: string, values?: Record<string, string | number>) => string;
}

type NotificationRow = {
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
};

/**
 * Creates in-app notifications (the bell) and pushes each one to the
 * recipient's devices with the bell's own wording and link. Use this
 * instead of inserting into `notifications` directly.
 */
export async function notify(rows: NotificationRow | NotificationRow[]) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .insert(list.map((r) => ({ ...r, payload: r.payload as { [key: string]: Json } })));
  if (error) {
    console.error("[notify] insert failed:", error.message);
    return;
  }

  for (const row of list) {
    sendPushAfterResponse([row.user_id], (locale) => ({
      title: "ouiKnow",
      body: notificationLabel(row, pushTranslator(locale, "Notifications")),
      url: `/${locale}${notificationHref(row)}`,
      tag: `${row.type}-${String(row.payload.generic_match_id ?? row.payload.post_id ?? "")}`,
    }));
  }
}
