"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

type ConversationMessage = {
  id: string;
  body: string;
  created_at: string;
  isReporter: boolean;
};

const REASON_LABEL_KEY: Record<string, string> = {
  inappropriate_content: "reasonInappropriateContent",
  harassment: "reasonHarassment",
  fraud_scam: "reasonFraudScam",
  fake_profile: "reasonFakeProfile",
  other: "reasonOther",
};

function formatTimestamp(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function AdminReportsPage() {
  const t = useTranslations("Admin");
  const tReport = useTranslations("Report");
  const locale = useLocale();
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, ConversationMessage[] | null>>({});

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

  function toggleConversation(reportId: string) {
    const next = expanded === reportId ? null : reportId;
    setExpanded(next);
    if (next && conversations[next] === undefined) {
      setConversations((prev) => ({ ...prev, [next]: null }));
      fetch(`/api/admin/reports/${next}/messages`)
        .then((res) => res.json())
        .then((body) => setConversations((prev) => ({ ...prev, [next]: body.messages ?? [] })));
    }
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

            <button
              type="button"
              onClick={() => toggleConversation(report.id)}
              className={ui.link + " text-sm mb-3"}
            >
              {expanded === report.id ? t("hideConversation") : t("viewConversation")}
            </button>

            {expanded === report.id && (
              <div className="rounded-xl border border-border bg-background mb-3 p-3 max-h-64 overflow-y-auto flex flex-col gap-2">
                {conversations[report.id] === null && <p className="text-sm text-muted">…</p>}
                {conversations[report.id]?.length === 0 && (
                  <p className="text-sm text-muted">{t("noConversation")}</p>
                )}
                {conversations[report.id]?.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                      m.isReporter ? "self-start bg-surface border border-border" : "self-end bg-primary text-white"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
                      {m.isReporter ? t("reporterLabel") : t("reportedLabel")}
                    </p>
                    {m.body}
                    <p className="text-[10px] opacity-70 mt-0.5">{formatTimestamp(m.created_at, locale)}</p>
                  </div>
                ))}
              </div>
            )}

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
