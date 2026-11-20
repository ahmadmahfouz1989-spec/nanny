import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushCounted } from "@/lib/push";

/**
 * Flash news (20261119000003_flash_news.sql): a line an admin posts for
 * everyone, scrolling in a banner at the top of the app until it's taken
 * down (FlashNewsBar), and pushed to phones once if the admin chooses.
 */
export type FlashNews = { id: string; body: string; bodyAr: string | null; createdAt: string };

export const FLASH_NEWS_MAX = 300;

type Db = ReturnType<typeof createAdminClient>;

/** People with a phone or browser that takes notifications (and an account that isn't suspended). */
async function usersWithDevices(db: Db): Promise<string[]> {
  const ids = new Set<string>();
  for (const table of ["native_push_tokens", "push_subscriptions"] as const) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from(table).select("user_id").order("user_id").range(from, from + 999);
      for (const r of data ?? []) ids.add(r.user_id);
      if (!data || data.length < 1000) break;
    }
  }
  const all = [...ids];
  const suspended = new Set<string>();
  for (let i = 0; i < all.length; i += 500) {
    const { data } = await db.from("users").select("id").in("id", all.slice(i, i + 500)).eq("status", "suspended");
    for (const r of data ?? []) suspended.add(r.id);
  }
  return all.filter((id) => !suspended.has(id));
}

/**
 * Pushes a flash news to everyone's devices, once (pushed_at is claimed
 * first, so a double tap can't send it twice). Returns false when it was
 * already pushed or is gone.
 */
export async function claimFlashNewsPush(db: Db, id: string) {
  const { data } = await db
    .from("flash_news")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .is("ended_at", null)
    .select("id, body, body_ar")
    .maybeSingle();
  return data;
}

export async function sendFlashNewsPush(db: Db, news: { id: string; body: string; body_ar: string | null }) {
  const users = await usersWithDevices(db);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < users.length; i += 200) {
    const counts = await sendPushCounted(users.slice(i, i + 200), (locale) => ({
      title: locale === "ar" ? "📢 عاجل من ouiKnow" : "📢 ouiKnow news",
      body: locale === "ar" && news.body_ar ? news.body_ar : news.body,
      url: `/${locale}/feed`,
      tag: `flash-${news.id}`,
    }));
    for (const c of counts.values()) {
      sent += c.sent;
      failed += c.failed;
    }
  }
  await db.from("flash_news").update({ push_sent: sent, push_failed: failed }).eq("id", news.id);
}
