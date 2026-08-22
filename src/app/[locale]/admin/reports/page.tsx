"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

type AdminReport = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter: { id: string; email: string | null; role: string } | null;
  reported: { id: string; email: string | null; role: string } | null;
};

const REASON_LABEL_KEY: Record<string, string> = {
  inappropriate_content: "reasonInappropriateContent",
  harassment: "reasonHarassment",
  fraud_scam: "reasonFraudScam",
  fake_profile: "reasonFakeProfile",
  other: "reasonOther",
};

export default function AdminReportsPage() {
  const t = useTranslations("Admin");
  const tReport = useTranslations("Report");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports?status=open")
      .then((res) => res.json())
      .then((body) => setReports(body.reports));
  }, []);

  async function decide(report: AdminReport, status: "resolved" | "dismissed") {
    setSubmitting(report.id);
    await fetch(`/api/admin/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolutionNotes: notes[report.id] }),
    });
    setSubmitting(null);
    setReports((prev) => prev?.filter((r) => r.id !== report.id) ?? null);
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("reportsTitle")}</h1>

      {reports && reports.length === 0 && <p className="text-sm text-muted">{t("reportsEmpty")}</p>}

      <div className="flex flex-col gap-4">
        {reports?.map((report) => (
          <div key={report.id} className={ui.card + " p-5"}>
            <div className="flex items-center gap-2 mb-2">
              <span className={ui.badge("warning")}>{tReport(REASON_LABEL_KEY[report.reason] ?? "reasonOther")}</span>
            </div>
            <p className="text-sm text-muted mb-1">
              {t("reportedBy")}: {report.reporter?.email ?? "—"} ({report.reporter?.role})
            </p>
            <p className="text-sm text-muted mb-3">
              {t("against")}: {report.reported?.email ?? "—"} ({report.reported?.role})
            </p>
            {report.details && <p className="text-sm text-ink/80 mb-3">{report.details}</p>}

            <textarea
              className={ui.input + " mb-2"}
              rows={2}
              placeholder={t("resolutionNotesPlaceholder")}
              value={notes[report.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => decide(report, "resolved")}
                disabled={submitting === report.id}
                className={ui.buttonPrimary + " px-4! py-1.5! text-sm"}
              >
                {t("resolve")}
              </button>
              <button
                onClick={() => decide(report, "dismissed")}
                disabled={submitting === report.id}
                className={ui.buttonSecondary + " px-4! py-1.5! text-sm"}
              >
                {t("dismiss")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
