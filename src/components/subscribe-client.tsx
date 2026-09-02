"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

const WHISH_NUMBER = process.env.NEXT_PUBLIC_WHISH_NUMBER ?? "";
const WHISH_NAME = process.env.NEXT_PUBLIC_WHISH_NAME ?? "";
const WHISH_NOTE = process.env.NEXT_PUBLIC_WHISH_NOTE ?? "";

type Me = { email: string | null; subscribed_until: string | null };

export default function SubscribeClient() {
  const t = useTranslations("Subscribe");
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.user && setMe({ email: body.user.email, subscribed_until: body.user.subscribed_until }));
  }, []);

  const activeUntil =
    me?.subscribed_until && new Date(me.subscribed_until) > new Date()
      ? new Date(me.subscribed_until)
      : null;

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d);

  return (
    <div className="max-w-lg mx-auto w-full px-6 py-8">
      <h1 className="font-display text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-6">{t("subtitle")}</p>

      <div
        className={`${ui.card} p-4 mb-6 text-sm ${
          activeUntil ? "bg-success-soft" : "bg-warning-soft"
        }`}
      >
        {activeUntil
          ? t("statusActive", { date: fmtDate(activeUntil) })
          : t("statusInactive")}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className={ui.card + " p-4 flex flex-col gap-1"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("planMonthly")}</p>
          <p className="font-display text-2xl font-bold">
            $6<span className="text-sm font-normal text-muted"> {t("perMonth")}</span>
          </p>
        </div>
        <div className={ui.card + " p-4 flex flex-col gap-1 border-primary/40"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t("planYearly")} · {t("bestValue")}
          </p>
          <p className="font-display text-2xl font-bold">
            $50<span className="text-sm font-normal text-muted"> {t("perYear")}</span>
          </p>
        </div>
      </div>

      <div className={ui.card + " p-5"}>
        <p className="font-display text-lg font-semibold mb-3">{t("howToPayTitle")}</p>
        <ol className="list-decimal ps-5 text-sm text-ink/80 flex flex-col gap-2">
          <li>
            {t("step1")}{" "}
            {WHISH_NUMBER ? (
              <span className="font-semibold text-ink">
                {WHISH_NUMBER}
                {WHISH_NAME ? ` (${WHISH_NAME})` : ""}
              </span>
            ) : (
              <span className="text-muted">{t("whishNotConfigured")}</span>
            )}
          </li>
          <li>
            {t("step2")}{" "}
            <span className="font-semibold text-ink">{me?.email ?? "…"}</span>
          </li>
          <li>{t("step3")}</li>
        </ol>
        {WHISH_NOTE && <p className="text-xs text-muted mt-3">{WHISH_NOTE}</p>}
      </div>
    </div>
  );
}
