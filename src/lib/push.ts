import { after } from "next/server";
import webpush from "web-push";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificationHref, notificationLabel } from "@/lib/notification-content";
import { isCategorySlug } from "@/lib/category-slugs";
import { apnsEnabled, fcmEnabled, sendApns, sendFcm } from "@/lib/native-push";
import type { Json } from "@/lib/supabase/database.types";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

/**
 * Push to every device a user turned notifications on for: browsers and
 * home-screen apps via web push (rows in push_subscriptions, written by
 * /api/push/subscription), and the iOS/Android apps via APNs/FCM (rows in
 * native_push_tokens, written by /api/push/native -- see native-push.ts).
 * Web push is off unless the VAPID keys are set -- generate a pair with
 * `npx web-push generate-vapid-keys`. Always best-effort: a push failure
 * never fails the action that caused it.
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

/** Any push channel at all: web push, or the iOS/Android apps. */
export function anyPushEnabled() {
  return pushEnabled() || apnsEnabled() || fcmEnabled();
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

/**
 * Sends to all of these users' devices, building the text per device
 * language. `skipNativeTokens`: app installs already told another way
 * (a call ringing on them).
 */
export async function sendPush(userIds: string[], build: (locale: Locale) => PushMessage, opts?: { skipNativeTokens?: Set<string> }) {
  if (!anyPushEnabled() || userIds.length === 0) return;
  const users = [...new Set(userIds)];
  await Promise.all([sendWebPush(users, build), sendNativePush(users, build, undefined, opts?.skipNativeTokens)]);
}

/** Devices per user: accepted by Apple/Google/the browser, or not. Dead tokens count as neither. */
export type DeviceCounts = Map<string, { sent: number; failed: number }>;

function count(counts: DeviceCounts | undefined, userId: string, result: "sent" | "failed") {
  if (!counts) return;
  const c = counts.get(userId) ?? { sent: 0, failed: 0 };
  c[result]++;
  counts.set(userId, c);
}

/** sendPush that says what happened per person, for callers keeping a log. Same sending, same token clean-up. */
export async function sendPushCounted(userIds: string[], build: (locale: Locale) => PushMessage): Promise<DeviceCounts> {
  const counts: DeviceCounts = new Map();
  const users = [...new Set(userIds)];
  await Promise.all([sendWebPush(users, build, counts), sendNativePush(users, build, counts)]);
  return counts;
}

async function sendWebPush(userIds: string[], build: (locale: Locale) => PushMessage, counts?: DeviceCounts) {
  if (!pushEnabled()) return;
  try {
    webpush.setVapidDetails(subject, publicKey!, privateKey!);
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, locale")
      .in("user_id", userIds);

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
          count(counts, s.user_id, "sent");
        } catch (err) {
          // 404/410: the browser dropped this subscription (app uninstalled,
          // permission revoked) -- forget it so we stop sending.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          else {
            console.error("[push] send failed:", status ?? err);
            count(counts, s.user_id, "failed");
          }
        }
      }),
    );

    if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
  } catch (err) {
    console.error("[push] failed:", err);
  }
}

async function sendNativePush(userIds: string[], build: (locale: Locale) => PushMessage, counts?: DeviceCounts, skip?: Set<string>) {
  // With a log to keep, go on: a phone that can't be reached because its side
  // isn't set up comes back as failed, not as having no phone.
  if (!counts && !apnsEnabled() && !fcmEnabled()) return;
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("native_push_tokens")
      .select("id, user_id, token, platform, locale")
      .in("user_id", userIds);

    // One send per platform and language, so each batch shares its text --
    // and per person on iPhones, whose icon shows their own count.
    const gone: string[] = [];
    const batches = new Map<string, NonNullable<typeof rows>>();
    for (const row of rows ?? []) {
      if (skip?.has(row.token)) continue;
      const key = `${row.platform}:${row.locale === "ar" ? "ar" : "en"}:${row.platform === "ios" ? row.user_id : ""}`;
      batches.set(key, [...(batches.get(key) ?? []), row]);
    }
    const badges = new Map<string, number>();
    await Promise.all(
      [...new Set((rows ?? []).filter((r) => r.platform === "ios").map((r) => r.user_id))].map(async (userId) => {
        // Unread messages + missed calls (20261119000002); before it, no number.
        const { data, error } = await admin.rpc("app_badge_count", { p_user: userId });
        if (!error && typeof data === "number") badges.set(userId, data);
      }),
    );
    await Promise.all(
      [...batches].map(async ([key, batch]) => {
        const [platform, locale] = key.split(":") as ["ios" | "android", Locale];
        const message = build(locale);
        const results =
          platform === "ios"
            ? await sendApns(batch.map((r) => r.token), { ...message, badge: badges.get(batch[0].user_id) })
            : await sendFcm(batch.map((r) => r.token), message);
        results.forEach((result, i) => {
          if (result === "gone") gone.push(batch[i].id);
          else count(counts, batch[i].user_id, result);
        });
      }),
    );

    if (gone.length > 0) await admin.from("native_push_tokens").delete().in("id", gone);
  } catch (err) {
    console.error("[push] native failed:", err);
  }
}

/**
 * Same as sendPush, but runs after the response is sent. Outside a request
 * (scripts, tests) after() throws, so it just sends in the background.
 */
export function sendPushAfterResponse(userIds: string[], build: (locale: Locale) => PushMessage) {
  if (!anyPushEnabled() || userIds.length === 0) return;
  try {
    after(() => sendPush(userIds, build));
  } catch {
    void sendPush(userIds, build);
  }
}

/** Untyped-key translator, the same shape the bell gets from useTranslations. */
export function pushTranslator(locale: Locale, namespace: "Notifications" | "Push" | "Nav" | "Calls") {
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
      body: notificationLabel(row, pushTranslator(locale, "Notifications"), (slug) => (isCategorySlug(slug) ? pushTranslator(locale, "Nav")(slug) : null)),
      url: `/${locale}${notificationHref(row)}`,
      tag: `${row.type}-${String(row.payload.generic_match_id ?? row.payload.post_id ?? row.payload.order_id ?? "")}`,
    }));
  }
}
