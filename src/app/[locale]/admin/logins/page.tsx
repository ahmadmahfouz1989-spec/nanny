"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type LoginEvent = {
  id: string;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  created_at: string;
  users: { email: string | null; role: string } | null;
};

type CountrySummary = { country: string; count: number };

function formatTimestamp(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function AdminLoginsPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [countrySummary, setCountrySummary] = useState<CountrySummary[]>([]);
  const [windowSize, setWindowSize] = useState(0);

  useEffect(() => {
    fetch("/api/admin/login-events")
      .then((res) => res.json())
      .then((body) => {
        setEvents(body.events ?? []);
        setCountrySummary(body.countrySummary ?? []);
        setWindowSize(body.windowSize ?? 0);
      });
  }, []);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-2">{t("loginsTitle")}</h1>
      <p className="text-sm text-muted mb-8">{t("loginsSubtitle", { count: windowSize })}</p>

      <h2 className={ui.eyebrow + " mb-3"}>{t("loginsByCountry")}</h2>
      {countrySummary.length === 0 && events !== null && (
        <p className="text-sm text-muted mb-8">{t("loginsEmpty")}</p>
      )}
      <div className="flex flex-col gap-2 mb-10">
        {countrySummary.map((c) => (
          <div key={c.country} className={ui.card + " px-4 py-2.5 flex items-center justify-between"}>
            <span className="text-sm font-medium">{c.country}</span>
            <span className={ui.badge("secondary")}>{c.count}</span>
          </div>
        ))}
      </div>

      <h2 className={ui.eyebrow + " mb-3"}>{t("loginsRecent")}</h2>
      <div className="flex flex-col gap-3">
        {events?.map((e) => (
          <div key={e.id} className={ui.card + " p-4 flex items-center justify-between gap-3"}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{e.users?.email ?? t("loginsUnknownUser")}</p>
              <p className="text-xs text-muted">
                {e.users?.role ? e.users.role[0]!.toUpperCase() + e.users.role.slice(1) : "—"}
                {" · "}
                {formatTimestamp(e.created_at, locale)}
              </p>
            </div>
            <div className="text-end shrink-0">
              <p className="text-sm font-medium">
                {e.country ? (e.country_code ? `${e.country} (${e.country_code})` : e.country) : t("loginsUnknownLocation")}
              </p>
              <p className="text-xs text-muted">
                {[e.city, e.ip].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
