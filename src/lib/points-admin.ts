import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Points & referrals for the admin panel: who has what, who invited whom
 * and how far those people went, and the totals. Service role; callers
 * check the admin first.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type PointsHolder = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  balance: number;
  earned: number;
  invited: number;
  code: string | null;
};

export type ReferralRow = {
  referrer: { id: string; name: string | null; email: string | null };
  referred: { id: string; name: string | null; email: string | null; phone: string | null };
  code: string;
  source: string;
  status: string;
  createdAt: string;
  firstRequest: boolean;
  firstCompleted: boolean;
};

export type PointsStats = {
  issued: number;
  adjusted: number;
  holders: number;
  referralsCounted: number;
  referralsPending: number;
  byRule: { rule: string; points: number; count: number }[];
};

async function people(db: Admin, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { name: string | null; email: string | null; phone: string | null }>();
  const { data } = await db.from("users").select("id, full_name, email, phone, contact_phone").in("id", unique);
  return new Map((data ?? []).map((u) => [u.id, { name: u.full_name, email: u.email, phone: u.phone ?? u.contact_phone }]));
}

/** Everyone with points (or a search for someone), highest balance first. */
export async function pointsHolders(search: string, db: Admin = createAdminClient()): Promise<PointsHolder[]> {
  const q = search.trim();
  let ids: string[] | null = null;
  if (q) {
    const safe = q.replace(/[^\p{L}\p{N}@.+\- ]/gu, "");
    const { data } = await db.from("users").select("id").or(`email.ilike.*${safe}*,full_name.ilike.*${safe}*,phone.ilike.*${safe}*`).limit(50);
    ids = (data ?? []).map((u) => u.id);
    if (!ids.length) return [];
  }
  let ledger = db.from("points_ledger").select("user_id, points").limit(50000);
  if (ids) ledger = ledger.in("user_id", ids);
  const [{ data: rows }, { data: refs }] = await Promise.all([ledger, db.from("referrals").select("referrer_user_id").eq("status", "counted").limit(50000)]);

  const totals = new Map<string, { balance: number; earned: number }>();
  for (const r of rows ?? []) {
    const t = totals.get(r.user_id) ?? { balance: 0, earned: 0 };
    t.balance += r.points;
    if (r.points > 0) t.earned += r.points;
    totals.set(r.user_id, t);
  }
  for (const id of ids ?? []) if (!totals.has(id)) totals.set(id, { balance: 0, earned: 0 });
  const invited = new Map<string, number>();
  for (const r of refs ?? []) invited.set(r.referrer_user_id, (invited.get(r.referrer_user_id) ?? 0) + 1);

  const top = [...totals.entries()].sort((a, b) => b[1].balance - a[1].balance).slice(0, 100);
  const [who, { data: codes }] = await Promise.all([
    people(db, top.map(([id]) => id)),
    top.length ? db.from("referral_codes").select("user_id, code").in("user_id", top.map(([id]) => id)) : Promise.resolve({ data: [] }),
  ]);
  const codeOf = new Map((codes ?? []).map((c) => [c.user_id, c.code]));
  return top.map(([userId, t]) => ({
    userId,
    name: who.get(userId)?.name ?? null,
    email: who.get(userId)?.email ?? null,
    phone: who.get(userId)?.phone ?? null,
    balance: t.balance,
    earned: t.earned,
    invited: invited.get(userId) ?? 0,
    code: codeOf.get(userId) ?? null,
  }));
}

/** The latest invites, with how far each invited person has gone. */
export async function recentReferrals(db: Admin = createAdminClient(), limit = 200): Promise<ReferralRow[]> {
  const { data: refs } = await db.from("referrals").select("*").order("created_at", { ascending: false }).limit(limit);
  const list = refs ?? [];
  if (!list.length) return [];
  const referredIds = list.map((r) => r.referred_user_id);
  const [who, { data: milestones }] = await Promise.all([
    people(db, [...list.map((r) => r.referrer_user_id), ...referredIds]),
    db.from("points_ledger").select("rule_key, ref").in("rule_key", ["referral_first_request", "referral_first_completed"]).in("ref", referredIds),
  ]);
  const reached = new Set((milestones ?? []).map((m) => `${m.rule_key}:${m.ref}`));
  return list.map((r) => ({
    referrer: { id: r.referrer_user_id, name: who.get(r.referrer_user_id)?.name ?? null, email: who.get(r.referrer_user_id)?.email ?? null },
    referred: {
      id: r.referred_user_id,
      name: who.get(r.referred_user_id)?.name ?? null,
      email: who.get(r.referred_user_id)?.email ?? null,
      phone: who.get(r.referred_user_id)?.phone ?? null,
    },
    code: r.code,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
    firstRequest: reached.has(`referral_first_request:${r.referred_user_id}`),
    firstCompleted: reached.has(`referral_first_completed:${r.referred_user_id}`),
  }));
}

export async function pointsStats(db: Admin = createAdminClient()): Promise<PointsStats> {
  const [{ data: rows }, { data: refs }] = await Promise.all([
    db.from("points_ledger").select("user_id, points, kind, rule_key").limit(100000),
    db.from("referrals").select("status").limit(100000),
  ]);
  const byRule = new Map<string, { points: number; count: number }>();
  let issued = 0;
  let adjusted = 0;
  const holders = new Set<string>();
  for (const r of rows ?? []) {
    holders.add(r.user_id);
    if (r.kind === "admin") adjusted += r.points;
    else if (r.points > 0) issued += r.points;
    if (r.rule_key) {
      const b = byRule.get(r.rule_key) ?? { points: 0, count: 0 };
      b.points += r.points;
      b.count += 1;
      byRule.set(r.rule_key, b);
    }
  }
  return {
    issued,
    adjusted,
    holders: holders.size,
    referralsCounted: (refs ?? []).filter((r) => r.status === "counted").length,
    referralsPending: (refs ?? []).filter((r) => r.status === "pending").length,
    byRule: [...byRule.entries()].map(([rule, v]) => ({ rule, ...v })).sort((a, b) => b.points - a.points),
  };
}
