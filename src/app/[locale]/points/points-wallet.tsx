"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import type { PointsRule, Wallet } from "@/lib/points";
import CountUp from "@/components/motion/count-up";
import { celebrate } from "@/lib/celebrate";

const noop = () => () => {};
const SEEN_KEY = "ouiknow_points_seen";

/** The balance last time this phone showed it (null the first time). */
function seenBalance(): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/** The wallet page: balance, invite link and sharing, who joined, how to earn, history. */
export default function PointsWallet({ wallet, rules, preview }: { wallet: Wallet; rules: PointsRule[]; preview: boolean }) {
  const t = useTranslations("Points");
  const tr = useTranslations("PointsRules");
  const format = useFormatter();
  const router = useRouter();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [code, setCode] = useState("");
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canSystemShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  // The balance counts up from what it was last time; points earned since
  // then get a little celebration.
  const lastSeen = useSyncExternalStore(noop, seenBalance, () => null);
  const balanceRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const before = seenBalance();
    if (before !== null && wallet.balance > before) setTimeout(() => celebrate(balanceRef.current), 450);
    try {
      localStorage.setItem(SEEN_KEY, String(wallet.balance));
    } catch {}
  }, [wallet.balance]);

  const link = () => new URL(`/r/${wallet.code}`, window.location.origin).toString();
  const message = () => t("shareText", { code: wallet.code, link: link() });

  async function copy(what: "link" | "code") {
    try {
      await navigator.clipboard.writeText(what === "link" ? link() : wallet.code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    const res = await request("/api/referrals/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, source: "code" }),
    });
    const body = await res?.json().catch(() => null);
    const result: string = body?.result ?? "invalid";
    setClaimMsg({ ok: result === "ok", text: t(`claim_${result}` as "claim_ok") });
    if (result === "ok") router.refresh();
  }

  const ruleLabel = (key: string | null) => (key && tr.has(key as "profile_complete") ? tr(key as "profile_complete") : null);
  const entryLabel = (e: Wallet["history"][number]) =>
    e.kind === "admin" ? (e.note ?? t("adminAdjustment")) : e.kind === "redeem" ? t("redeemed") : (ruleLabel(e.ruleKey) ?? t("points"));
  const referralRules = rules.filter((r) => r.kind === "referral");
  const activityRules = rules.filter((r) => r.kind === "activity");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      {preview && <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{t("previewNote")}</p>}

      <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>

      {/* Balance */}
      <section className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-primary to-primary-hover p-5 text-on-primary shadow-sm">
        <div>
          <p className="text-sm opacity-90">{t("balance")}</p>
          <p className="font-display text-5xl font-extrabold tabular-nums">
            <span ref={balanceRef}>
              <CountUp value={wallet.balance} from={lastSeen ?? 0} format={(n) => format.number(n)} />
            </span>
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {[
            [t("earned"), wallet.earned],
            [t("fromInvites"), wallet.fromReferrals],
            [t("fromActivities"), wallet.fromActivities],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-2xl bg-white/15 px-3 py-2">
              <dt className="text-xs opacity-90">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">{format.number(n as number)}</dd>
            </div>
          ))}
        </dl>
        {wallet.spent > 0 && <p className="text-xs opacity-90">{t("spent", { points: format.number(wallet.spent) })}</p>}
      </section>

      {/* Invite */}
      <section className={ui.card + " flex flex-col gap-3 p-5"}>
        <h2 className="font-display text-lg font-semibold text-ink">{t("inviteTitle")}</h2>
        <p className="text-sm text-muted">{t("inviteBody")}</p>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-sunken px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t("yourCode")}</p>
            <p className="font-display text-2xl font-bold tracking-[0.2em] text-ink" dir="ltr">
              {wallet.code}
            </p>
          </div>
          <button type="button" onClick={() => copy("code")} className={ui.buttonSecondary + " py-2!"}>
            {copied === "code" ? t("copied") : t("copyCode")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message())}`, "_blank", "noopener")}
            className={ui.buttonPrimary + " py-2.5!"}
          >
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link())}`, "_blank", "noopener")}
            className={ui.buttonSecondary + " py-2.5!"}
          >
            Facebook
          </button>
          <button type="button" onClick={() => copy("link")} className={ui.buttonSecondary + " py-2.5!"}>
            {copied === "link" ? t("copied") : t("copyLink")}
          </button>
          {canSystemShare && (
            <button
              type="button"
              onClick={() => navigator.share({ title: "ouiKnow", text: message() }).catch(() => {})}
              className={ui.buttonSecondary + " py-2.5!"}
            >
              {t("moreShare")}
            </button>
          )}
        </div>
        <p className="text-xs text-muted">{t("instagramHint")}</p>
      </section>

      {/* People who joined */}
      <section className={ui.card + " flex flex-col gap-2 p-5"}>
        <h2 className="font-display text-lg font-semibold text-ink">{t("invitedTitle", { count: wallet.invited.length })}</h2>
        {wallet.invited.length === 0 ? (
          <p className="text-sm text-muted">{t("invitedEmpty")}</p>
        ) : (
          <ul className="rise-in divide-y divide-border">
            {wallet.invited.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{p.firstName ?? t("someone")}</span>
                <span className={p.status === "counted" ? "text-success" : "text-muted"}>{t(`invited_${p.status}` as "invited_counted")}</span>
              </li>
            ))}
          </ul>
        )}
        {wallet.invitedBy && <p className="border-t border-border pt-2 text-xs text-muted">{t("invitedBy", { name: wallet.invitedBy })}</p>}
      </section>

      {/* Invited by someone? (new accounts only) */}
      {wallet.canClaim && (
        <form onSubmit={claim} className={ui.card + " flex flex-col gap-2 p-5"}>
          <label htmlFor="invite-code" className="font-semibold text-ink">
            {t("claimTitle")}
          </label>
          <p className="text-sm text-muted">{t("claimBody")}</p>
          <div className="flex gap-2">
            <input
              id="invite-code"
              dir="ltr"
              autoCapitalize="characters"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={ui.input + " flex-1 tracking-widest"}
              placeholder="AB12CD"
            />
            <button type="submit" disabled={code.trim().length < 4} className={ui.buttonPrimary}>
              {t("claimSend")}
            </button>
          </div>
          {claimMsg && <p className={`text-sm ${claimMsg.ok ? "text-success" : "text-danger"}`}>{claimMsg.text}</p>}
        </form>
      )}

      {/* How to earn */}
      <section className={ui.card + " flex flex-col gap-3 p-5"}>
        <h2 className="font-display text-lg font-semibold text-ink">{t("howTitle")}</h2>
        {[
          [t("howInvites"), referralRules],
          [t("howActivities"), activityRules],
        ].map(([title, list]) =>
          (list as PointsRule[]).length ? (
            <div key={title as string}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title as string}</p>
              <ul className="divide-y divide-border">
                {(list as PointsRule[]).map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-ink">{ruleLabel(r.key) ?? r.key}</span>
                    <span className="shrink-0 font-semibold text-primary tabular-nums">+{format.number(r.points)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        <p className="text-xs text-muted">{t("fairNote")}</p>
      </section>

      {/* History */}
      <section className={ui.card + " flex flex-col gap-2 p-5"}>
        <h2 className="font-display text-lg font-semibold text-ink">{t("historyTitle")}</h2>
        {wallet.history.length === 0 ? (
          <p className="text-sm text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="rise-in divide-y divide-border">
            {wallet.history.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{entryLabel(e)}</span>
                  <span className="text-xs text-muted">{format.dateTime(new Date(e.createdAt), { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${e.points > 0 ? "text-success" : "text-danger"}`} dir="ltr">
                  {e.points > 0 ? "+" : ""}
                  {format.number(e.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
