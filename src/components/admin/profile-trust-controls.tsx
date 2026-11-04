"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import VerifiedCheck from "@/components/verified-check";

// A verification "with no end date" is stored 100 years out.
const NO_END = new Date("2100-01-01");

/**
 * On an approved profile in Admin -> Profiles: verify the person or take
 * it away. Verified means the blue check after their name and being shown
 * first in match and browse lists -- for their whole account, so every
 * profile they have. For 30 days or a year (paid with Whish), or with no
 * end date.
 */
export default function ProfileTrustControls({ userId, featuredUntil: initial }: { userId: string; featuredUntil: string | null }) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [until, setUntil] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verified = !!until && new Date(until) > new Date();
  const forever = verified && new Date(until!) > NO_END;

  async function call(method: "POST" | "DELETE", plan?: "monthly" | "yearly" | "permanent") {
    setBusy(true);
    setError(null);
    const res = await request(`/api/admin/users/${userId}/featured`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: plan ? JSON.stringify({ plan }) : undefined,
    });
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(typeof data?.error === "string" ? data.error : t("moderationActionError"));
      return;
    }
    setUntil(data?.featured_until ?? null);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-surface-sunken/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          {verified ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <VerifiedCheck label={t("verified")} />
              {forever ? t("verifiedNoEnd") : t("verifiedUntil", { date: format.dateTime(new Date(until!), { dateStyle: "medium" }) })}
            </span>
          ) : (
            <span className="text-muted">{t("notVerified")}</span>
          )}
          <p className="text-xs text-muted">{t("verifiedExplainer")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!forever &&
            (["monthly", "yearly", "permanent"] as const).map((plan) => (
              <button key={plan} type="button" disabled={busy} className={ui.buttonSecondary + " px-4! py-1.5! text-sm"} onClick={() => call("POST", plan)}>
                {t(verified ? `verifyAdd_${plan}` : `verify_${plan}`)}
              </button>
            ))}
          {verified && (
            <button type="button" disabled={busy} className={ui.buttonGhost + " px-3! py-1! text-sm text-danger!"} onClick={() => call("DELETE")}>
              {t("removeVerification")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
