"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";

/**
 * "Share my profile" for an approved provider: the phone's share sheet
 * (WhatsApp, Instagram, Facebook…) where there is one, otherwise copy the
 * link, plus WhatsApp and Facebook buttons. The link carries utm tags, so
 * visits and sign-ups from shared profiles show up as their own source.
 * Also the switch that turns the public page off.
 */
export default function ShareProfileButton({
  profileId,
  name,
  service,
  initialPublic,
  autoOpen = false,
}: {
  profileId: string;
  name: string;
  service: string;
  initialPublic: boolean;
  /** Opened from the "approved -- share it now" notification: show the options straight away. */
  autoOpen?: boolean;
}) {
  const t = useTranslations("PublicProfile");
  const locale = useLocale();
  const [open, setOpen] = useState(autoOpen);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const link = () => {
    const url = new URL(`/${locale}/u/${profileId}`, window.location.origin);
    url.searchParams.set("utm_source", "profile_share");
    url.searchParams.set("utm_medium", "social");
    return url.toString();
  };
  const message = t("shareText", { name, service });

  async function share() {
    if (!isPublic) {
      setOpen(true);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, text: message, url: link() });
        return;
      } catch {
        // Cancelled, or not allowed here: fall through to the options.
      }
    }
    setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function togglePublic() {
    setSaving(true);
    const res = await request("/api/generic-profile/public-page", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, on: !isPublic }),
    });
    setSaving(false);
    if (res?.ok) setIsPublic(!isPublic);
  }

  return (
    <>
      <button type="button" className={ui.buttonPrimary} onClick={share}>
        {t("share")}
      </button>
      {open && (
        <div className={ui.card + " mt-2 flex w-full flex-col gap-3 p-4"}>
          {isPublic ? (
            <>
              <p className="text-sm text-muted">{t("shareHint")}</p>
              <div className="flex flex-wrap gap-2">
                {/* Built on tap: the link needs the page's address, which the
                    server doesn't have when this opens already showing. */}
                <button
                  type="button"
                  className={ui.buttonSecondary}
                  onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${message} ${link()}`)}`, "_blank", "noopener")}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  className={ui.buttonSecondary}
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link())}`, "_blank", "noopener")}
                >
                  Facebook
                </button>
                <button type="button" className={ui.buttonSecondary} onClick={copy}>
                  {copied ? t("copied") : t("copyLink")}
                </button>
              </div>
              <p className="text-xs text-muted">{t("instagramHint")}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t("offHint")}</p>
          )}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="accent-primary" checked={isPublic} disabled={saving} onChange={togglePublic} />
            {t("publicToggle")}
          </label>
        </div>
      )}
    </>
  );
}
