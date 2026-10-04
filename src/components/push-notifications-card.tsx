"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push-client";
import { ui } from "@/lib/ui";

const noopSubscribe = () => () => {};

/**
 * Profile card that turns push notifications on or off for this device
 * (each phone/browser subscribes separately). Hidden entirely when the
 * server has no VAPID key configured.
 */
export default function PushNotificationsCard() {
  const t = useTranslations("Push");
  const locale = useLocale();
  const support = useSyncExternalStore<PushSupport | null>(noopSubscribe, pushSupport, () => null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (support !== "supported") return;
    currentSubscription()
      .then((sub) => {
        setDenied(Notification.permission === "denied");
        setOn(!!sub && Notification.permission === "granted");
      })
      .catch(() => setOn(false));
  }, [support]);

  if (support === null || support === "unconfigured") return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        const permission = await enablePush(locale);
        setOn(permission === "granted");
        setDenied(permission === "denied");
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.card + " p-6 mb-5"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted mb-2">{t("title")}</p>
          <p className="text-sm text-muted">
            {support === "needs-install"
              ? t("needsInstall")
              : support === "unsupported"
                ? t("unsupported")
                : denied
                  ? t("blocked")
                  : t("description")}
          </p>
        </div>
        {support === "supported" && !denied && on !== null && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={t("title")}
            onClick={toggle}
            disabled={busy}
            className={`relative mt-6 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              on ? "bg-primary" : "bg-border-strong"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
              }`}
            />
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{t("error")}</p>}
    </div>
  );
}
