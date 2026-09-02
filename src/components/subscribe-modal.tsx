"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";

/**
 * Shown when a non-subscribed user tries to connect (express interest,
 * message, or view contact details). All those actions return 402.
 */
export default function SubscribeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Subscribe");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className={`${ui.card} relative z-10 w-full max-w-sm bg-surface p-6 text-center`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="font-display text-lg font-bold mb-1">{t("blockedTitle")}</h2>
        <p className="text-sm text-muted mb-5">{t("blockedBody")}</p>
        <div className="flex flex-col gap-2">
          <Link href="/subscribe" className={ui.buttonPrimary + " w-full"}>
            {t("blockedCta")}
          </Link>
          <button type="button" onClick={onClose} className={ui.buttonGhost + " w-full"}>
            {t("notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
