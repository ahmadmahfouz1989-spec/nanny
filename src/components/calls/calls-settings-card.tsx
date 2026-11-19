"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getJson, request } from "@/lib/request";
import { ui } from "@/lib/ui";

/** Settings: whether people you've messaged can call you in the app. */
export default function CallsSettingsCard() {
  const t = useTranslations("Calls");
  const tCommon = useTranslations("Matches");
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJson<{ acceptsCalls: boolean }>("/api/calls/preferences").then((body) => body && setOn(body.acceptsCalls));
  }, []);

  async function toggle() {
    if (on === null) return;
    const next = !on;
    setBusy(true);
    setError(false);
    setOn(next);
    const res = await request("/api/calls/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acceptsCalls: next }),
    });
    setBusy(false);
    if (!res?.ok) {
      setOn(!next);
      setError(true);
    }
  }

  if (on === null) return null;
  return (
    <div className={ui.card + " p-6 mb-5"}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted mb-2">{t("settingsTitle")}</p>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t("settingsAllow")}</p>
          <p className="mt-1 text-sm text-muted">{on ? t("settingsOn") : t("settingsOff")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("settingsAllow")}
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-primary" : "bg-border-strong"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{tCommon("actionError")}</p>}
    </div>
  );
}
