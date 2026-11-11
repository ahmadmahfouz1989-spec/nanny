import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Points & referrals, the server side (see the points_and_referrals
 * migration: the database awards points from real events; this file reads
 * them, makes codes and records who invited whom). Service role only.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** No 0/O, 1/I/L: a code read out over the phone or typed from a screenshot. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-Z0-9]{6,10}$/;
/** How long after signing up someone can still say who invited them. */
export const CLAIM_WINDOW_DAYS = 7;

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.ouiknow.app";
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "https://apps.apple.com/search?term=ouiKnow";

export function referralLink(origin: string, code: string) {
  return `${origin}/r/${code}`;
}

/** Google Play passes `referrer` to the app on its first launch (Install Referrer). */
export function playStoreLink(code: string) {
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(`ref=${code}`)}`;
}

export function normalizeCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** This person's code, made the first time it's asked for. */
export async function referralCode(userId: string, db: Admin = createAdminClient()): Promise<string> {
  const { data } = await db.from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
  if (data) return data.code;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const { error } = await db.from("referral_codes").insert({ user_id: userId, code });
    if (!error) return code;
    // Someone else made theirs at the same moment: theirs stands.
    const { data: again } = await db.from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
    if (again) return again.code;
  }
  throw new Error("Couldn't make a referral code");
}

/** The inviter behind a code, with the first name shown on the invite page. */
export async function inviterOf(code: string, db: Admin = createAdminClient()) {
  const clean = normalizeCode(code);
  if (!CODE_RE.test(clean)) return null;
  const { data } = await db.from("referral_codes").select("user_id, code").eq("code", clean).maybeSingle();
  if (!data) return null;
  const { data: user } = await db.from("users").select("full_name, status").eq("id", data.user_id).maybeSingle();
  if (!user || user.status !== "active") return null;
  return { userId: data.user_id, code: data.code, firstName: user.full_name?.trim().split(/\s+/)[0] ?? null };
}

export type ClaimResult = "ok" | "invalid" | "own" | "already" | "too_late";

/**
 * Records that `userId` was invited with `code`. Only a new account (in
 * its first days), only once, never your own code. The invite counts --
 * and pays -- when their phone is verified (the database does that).
 */
export async function claimReferral(userId: string, code: string, source: "link" | "code" | "play_store"): Promise<ClaimResult> {
  const db = createAdminClient();
  const inviter = await inviterOf(code, db);
  if (!inviter) return "invalid";
  if (inviter.userId === userId) return "own";
  const [{ data: me }, { data: existing }] = await Promise.all([
    db.from("users").select("created_at").eq("id", userId).single(),
    db.from("referrals").select("referred_user_id").eq("referred_user_id", userId).maybeSingle(),
  ]);
  if (existing) return "already";
  if (!me || Date.now() - Date.parse(me.created_at) > CLAIM_WINDOW_DAYS * 86_400_000) return "too_late";
  // Two people inviting each other is one person with two accounts, most likely.
  const { data: reverse } = await db.from("referrals").select("referred_user_id").eq("referred_user_id", inviter.userId).eq("referrer_user_id", userId).maybeSingle();
  if (reverse) return "invalid";
  const { error } = await db.from("referrals").insert({ referred_user_id: userId, referrer_user_id: inviter.userId, code: inviter.code, source });
  if (error) return error.code === "23505" ? "already" : "invalid";
  return "ok";
}

export type LedgerEntry = { id: string; points: number; kind: string; ruleKey: string | null; note: string | null; createdAt: string };
export type InvitedPerson = { firstName: string | null; status: "pending" | "counted" | "rejected"; createdAt: string };

export type Wallet = {
  balance: number;
  earned: number;
  spent: number;
  fromReferrals: number;
  fromActivities: number;
  history: LedgerEntry[];
  code: string;
  invited: InvitedPerson[];
  /** Can still enter who invited them (new account, none yet). */
  canClaim: boolean;
  invitedBy: string | null;
};

export async function wallet(userId: string): Promise<Wallet> {
  const db = createAdminClient();
  const [code, { data: rows }, { data: invited }, { data: me }, { data: mine }] = await Promise.all([
    referralCode(userId, db),
    db.from("points_ledger").select("id, points, kind, rule_key, note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
    db.from("referrals").select("referred_user_id, status, created_at").eq("referrer_user_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("users").select("created_at").eq("id", userId).single(),
    db.from("referrals").select("referrer_user_id").eq("referred_user_id", userId).maybeSingle(),
  ]);
  const ledger = rows ?? [];
  const sum = (f: (r: (typeof ledger)[number]) => boolean) => ledger.filter(f).reduce((s, r) => s + r.points, 0);

  const ids = [...(invited ?? []).map((r) => r.referred_user_id), ...(mine ? [mine.referrer_user_id] : [])];
  const { data: names } = ids.length ? await db.from("users").select("id, full_name").in("id", ids) : { data: [] };
  const first = new Map((names ?? []).map((n) => [n.id, n.full_name?.trim().split(/\s+/)[0] ?? null]));

  return {
    balance: sum(() => true),
    earned: sum((r) => r.points > 0),
    spent: -sum((r) => r.kind === "redeem"),
    fromReferrals: sum((r) => r.kind === "referral"),
    fromActivities: sum((r) => r.kind === "activity"),
    history: ledger.slice(0, 100).map((r) => ({ id: r.id, points: r.points, kind: r.kind, ruleKey: r.rule_key, note: r.kind === "admin" ? r.note : null, createdAt: r.created_at })),
    code,
    invited: (invited ?? []).map((r) => ({ firstName: first.get(r.referred_user_id) ?? null, status: r.status as InvitedPerson["status"], createdAt: r.created_at })),
    canClaim: !mine && !!me && Date.now() - Date.parse(me.created_at) <= CLAIM_WINDOW_DAYS * 86_400_000,
    invitedBy: mine ? (first.get(mine.referrer_user_id) ?? null) : null,
  };
}

export type PointsRule = {
  key: string;
  kind: "activity" | "referral";
  points: number;
  enabled: boolean;
  maxTotal: number | null;
  maxPerDay: number | null;
  maxPerMonth: number | null;
};

export async function pointsRules(db: Admin = createAdminClient()): Promise<PointsRule[]> {
  const { data } = await db.from("points_rules").select("*").order("sort_order");
  return (data ?? []).map((r) => ({
    key: r.key,
    kind: r.kind as PointsRule["kind"],
    points: r.points,
    enabled: r.enabled,
    maxTotal: r.max_total,
    maxPerDay: r.max_per_day,
    maxPerMonth: r.max_per_month,
  }));
}

/** Released from the admin panel; until then nothing is earned or shown. */
export async function pointsReleased(db: Admin = createAdminClient()): Promise<boolean> {
  const { data } = await db.from("points_settings").select("enabled").maybeSingle();
  return !!data?.enabled;
}

/** Whether this person sees Points & invites: everyone once released; admins before, to set it up. */
export async function canSeePoints(userId: string | null, db: Admin = createAdminClient()): Promise<boolean> {
  if (!userId) return false;
  const [released, { data: me }] = await Promise.all([pointsReleased(db), db.from("users").select("role").eq("id", userId).maybeSingle()]);
  return released || me?.role === "admin";
}

/** "Did someone invite you?" is asked: Points released, a new account, no invite yet. */
export async function canClaimInvite(userId: string, db: Admin = createAdminClient()): Promise<boolean> {
  const [released, { data: invited }, { data: me }] = await Promise.all([
    pointsReleased(db),
    db.from("referrals").select("referred_user_id").eq("referred_user_id", userId).maybeSingle(),
    db.from("users").select("created_at").eq("id", userId).single(),
  ]);
  return released && !invited && !!me && Date.now() - Date.parse(me.created_at) <= CLAIM_WINDOW_DAYS * 86_400_000;
}
