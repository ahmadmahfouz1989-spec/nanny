"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";

/** The owner's one-line headline on their profile page, edited in place. */
export default function HeadlineEditor({ profileId, initial }: { profileId: string; initial: string | null }) {
  const t = useTranslations("Work");
  const router = useRouter();
  const [headline, setHeadline] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    setSaving(true);
    setError(false);
    const res = await request("/api/generic-profile/headline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, headline: draft.trim() }),
    });
    setSaving(false);
    if (!res || !res.ok) {
      setError(true);
      return;
    }
    setHeadline(draft.trim() || null);
    setEditing(false);
    // A new headline sends the profile back to review -- show that.
    router.refresh();
  }

  if (!editing) {
    return headline ? (
      <div className="flex items-start gap-2">
        <p dir="auto" className="text-[15px] font-medium text-ink flex-1">
          {headline}
        </p>
        <button type="button" onClick={() => setEditing(true)} className={ui.link + " text-xs shrink-0 mt-1"}>
          {t("headlineEdit")}
        </button>
      </div>
    ) : (
      <button type="button" onClick={() => setEditing(true)} className={ui.link + " text-sm self-start"}>
        + {t("headlineAdd")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        className={ui.input}
        value={draft}
        maxLength={80}
        dir="auto"
        autoFocus
        placeholder={t("headlinePlaceholder")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      <p className="text-xs text-muted">{t("headlineHint")}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={ui.buttonPrimary + " px-4! py-1.5!"}>
          {t("headlineSave")}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDraft(headline ?? "");
          }}
          className={ui.buttonGhost}
        >
          {t("headlineCancel")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{t("headlineError")}</p>}
    </div>
  );
}
