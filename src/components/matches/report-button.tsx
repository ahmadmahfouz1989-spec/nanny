"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

const REASONS = ["inappropriate_content", "harassment", "fraud_scam", "fake_profile", "other"] as const;

const REASON_LABEL_KEY: Record<(typeof REASONS)[number], string> = {
  inappropriate_content: "reasonInappropriateContent",
  harassment: "reasonHarassment",
  fraud_scam: "reasonFraudScam",
  fake_profile: "reasonFakeProfile",
  other: "reasonOther",
};

export default function ReportButton({
  profileId,
  profileType,
}: {
  profileId: string;
  profileType: "parent" | "nanny";
}) {
  const t = useTranslations("Report");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("inappropriate_content");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    setSubmitting(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedProfileId: profileId, profileType, reason, details: details || undefined }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSubmitted(true);
      setOpen(false);
    }
  }

  if (submitted) {
    return <p className="text-xs text-muted mt-2">{t("submitted")}</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-danger transition mt-2">
        {t("action")}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-border p-3 flex flex-col gap-2">
      <label className={ui.label + " text-xs"}>{t("reasonLabel")}</label>
      <select
        className={ui.select}
        value={reason}
        onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
      >
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {t(REASON_LABEL_KEY[r])}
          </option>
        ))}
      </select>
      <textarea
        className={ui.input}
        rows={2}
        placeholder={t("detailsPlaceholder")}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={submitting} className={ui.buttonPrimary + " px-4! py-1.5! text-xs"}>
          {submitting ? t("submitting") : t("submit")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ui.buttonGhost + " text-xs"}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
