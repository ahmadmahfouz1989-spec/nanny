/**
 * The invite code someone arrived with, kept on this device until they have
 * an account to attach it to (then /api/referrals/claim, from
 * ReferralClaimer). Browser storage only: best effort.
 */
export type StoredInvite = { code: string; source: "link" | "code" | "play_store"; at: number };

const KEY = "ouiknow_invite";
/** An invite older than this is forgotten. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function rememberInvite(code: string, source: StoredInvite["source"]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, source, at: Date.now() } satisfies StoredInvite));
  } catch {}
}

export function storedInvite(): StoredInvite | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as StoredInvite | null;
    if (!v || typeof v.code !== "string" || Date.now() - v.at > KEEP_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
