import { getFormatter, getTranslations } from "next-intl/server";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { ui } from "@/lib/ui";
import { pointsReleased, pointsRules } from "@/lib/points";
import { pointsHolders, pointsStats, recentReferrals } from "@/lib/points-admin";
import { ReleaseSwitch, RulesEditor, AdjustPoints } from "./points-admin-client";

/**
 * Points & referrals: the release switch, what each activity is worth,
 * who has how many points (and a way to correct them), who invited whom
 * and how far those people went, and the totals. The admin layout checks
 * the admin.
 */
export default async function AdminPointsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const t = await getTranslations("AdminPoints");
  const tr = await getTranslations("PointsRules");
  const format = await getFormatter();
  const [released, rules, stats, holders, referrals] = await Promise.all([pointsReleased(), pointsRules(), pointsStats(), pointsHolders(q), recentReferrals()]);
  const ruleName = (key: string) => (tr.has(key as "profile_complete") ? tr(key as "profile_complete") : key);
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title={t("title")} description={t("subtitle")} />

      <ReleaseSwitch initial={released} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          [t("statIssued"), stats.issued],
          [t("statAdjusted"), stats.adjusted],
          [t("statHolders"), stats.holders],
          [t("statCounted"), stats.referralsCounted],
          [t("statPending"), stats.referralsPending],
        ].map(([label, n]) => (
          <div key={label as string} className={ui.card + " p-4"}>
            <p className="text-xs text-muted">{label}</p>
            <p className="text-2xl font-bold tabular-nums text-ink">{format.number(n as number)}</p>
          </div>
        ))}
      </section>

      <section className={ui.card + " p-5"}>
        <h2 className="mb-1 font-display text-lg font-semibold">{t("rulesTitle")}</h2>
        <p className="mb-4 text-sm text-muted">{t("rulesBody")}</p>
        <RulesEditor rules={rules.map((r) => ({ ...r, label: ruleName(r.key) }))} />
      </section>

      {stats.byRule.length > 0 && (
        <section className={ui.card + " p-5"}>
          <h2 className="mb-3 font-display text-lg font-semibold">{t("byRuleTitle")}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {stats.byRule.map((r) => (
                <tr key={r.rule}>
                  <td className="py-2 text-ink">{ruleName(r.rule)}</td>
                  <td className="py-2 text-end tabular-nums text-muted">{t("times", { count: r.count })}</td>
                  <td className="py-2 text-end font-semibold tabular-nums">{format.number(r.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className={ui.card + " p-5"}>
        <h2 className="mb-3 font-display text-lg font-semibold">{t("holdersTitle")}</h2>
        <form className="mb-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className={ui.input + " flex-1"} />
          <button type="submit" className={ui.buttonSecondary}>
            {t("search")}
          </button>
        </form>
        {holders.length === 0 ? (
          <p className="text-sm text-muted">{t("noneYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-start text-xs text-muted">
                <tr>
                  <th className="py-2 text-start font-medium">{t("colPerson")}</th>
                  <th className="py-2 text-start font-medium">{t("colCode")}</th>
                  <th className="py-2 text-end font-medium">{t("colInvited")}</th>
                  <th className="py-2 text-end font-medium">{t("colEarned")}</th>
                  <th className="py-2 text-end font-medium">{t("colBalance")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {holders.map((h) => (
                  <tr key={h.userId} className="align-top">
                    <td className="py-2">
                      <span className="block font-medium text-ink">{h.name ?? "—"}</span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {[h.email, h.phone].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      {h.code ?? "—"}
                    </td>
                    <td className="py-2 text-end tabular-nums">{h.invited}</td>
                    <td className="py-2 text-end tabular-nums">{format.number(h.earned)}</td>
                    <td className="py-2 text-end font-semibold tabular-nums">{format.number(h.balance)}</td>
                    <td className="py-2 text-end">
                      <AdjustPoints userId={h.userId} name={h.name ?? h.email ?? ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={ui.card + " p-5"}>
        <h2 className="mb-3 font-display text-lg font-semibold">{t("referralsTitle")}</h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-muted">{t("noneYet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 text-start font-medium">{t("colInviter")}</th>
                  <th className="py-2 text-start font-medium">{t("colInvitedPerson")}</th>
                  <th className="py-2 text-start font-medium">{t("colSource")}</th>
                  <th className="py-2 text-start font-medium">{t("colStatus")}</th>
                  <th className="py-2 text-start font-medium">{t("colProgress")}</th>
                  <th className="py-2 text-start font-medium">{t("colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {referrals.map((r) => (
                  <tr key={r.referred.id} className="align-top">
                    <td className="py-2">
                      <span className="block text-ink">{r.referrer.name ?? "—"}</span>
                      <span className="block text-xs text-muted" dir="ltr">{r.referrer.email}</span>
                    </td>
                    <td className="py-2">
                      <span className="block text-ink">{r.referred.name ?? "—"}</span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {[r.referred.email, r.referred.phone].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="py-2 text-muted">{t(`source_${r.source}` as "source_link")}</td>
                    <td className="py-2">
                      <span className={ui.badge(r.status === "counted" ? "success" : r.status === "pending" ? "secondary" : "danger")}>{t(`status_${r.status}` as "status_counted")}</span>
                    </td>
                    <td className="py-2 text-xs text-muted">
                      {[r.firstRequest && t("progressRequest"), r.firstCompleted && t("progressCompleted")].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 text-xs text-muted">{date(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
