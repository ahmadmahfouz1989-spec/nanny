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
  reporter: { id: string; email: string | null; role: string | null; name?: string; category?: string | null } | null;
  reported: { id: string; email: string | null; role: string | null; name?: string; category?: string | null } | null;
  post: { id: string; kind: string; caption: string } | null;
};

type ConversationMessage = {
  id: string;
  body: string;
  created_at: string;
  isReporter: boolean;
  audioUrl: string | null;
  audioDurationSeconds: number | null;
};

type ConversationState = { messages: ConversationMessage[]; hasOlder: boolean; loadingOlder: boolean };

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
  const tMatches = useTranslations("Matches");
  const locale = useLocale();
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, ConversationState | null>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports?status=open")
      .then((res) => res.json())
      .then((body) => setReports(body.reports));
  }, []);

  async function decide(report: AdminReport, status: "resolved" | "dismissed") {
    setSubmitting(report.id);
    const res = await fetch(`/api/admin/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolutionNotes: notes[report.id] }),
    });
    setSubmitting(null);

    if (!res.ok) {
      setNotice(t("moderationActionError"));
      setTimeout(() => setNotice(null), 8000);
      return;
    }

    setReports((prev) => prev?.filter((r) => r.id !== report.id) ?? null);
  }

  function toggleConversation(reportId: string) {
    const next = expanded === reportId ? null : reportId;
    setExpanded(next);
    if (next && conversations[next] === undefined) {
      setConversations((prev) => ({ ...prev, [next]: null }));
      fetch(`/api/admin/reports/${next}/messages`)
        .then((res) => res.json())
        .then((body) =>
          setConversations((prev) => ({
            ...prev,
            [next]: { messages: body.messages ?? [], hasOlder: !!body.hasOlder, loadingOlder: false },
          })),
        );
    }
  }

  // The endpoint returns the newest window first -- page backwards from
  // the oldest message currently shown until the admin has what they need.
  async function loadOlder(reportId: string) {
    const current = conversations[reportId];
    if (!current || current.loadingOlder || !current.hasOlder || current.messages.length === 0) return;
    setConversations((prev) => ({ ...prev, [reportId]: { ...current, loadingOlder: true } }));
    try {
      const res = await fetch(
        `/api/admin/reports/${reportId}/messages?before=${encodeURIComponent(current.messages[0]!.created_at)}`,
      );
      const body = res.ok ? await res.json() : null;
      setConversations((prev) => {
        const latest = prev[reportId];
        if (!latest) return prev;
        if (!body) return { ...prev, [reportId]: { ...latest, loadingOlder: false } };
        const known = new Set(latest.messages.map((m) => m.id));
        const older = ((body.messages ?? []) as ConversationMessage[]).filter((m) => !known.has(m.id));
        return {
          ...prev,
          [reportId]: { messages: [...older, ...latest.messages], hasOlder: !!body.hasOlder, loadingOlder: false },
        };
      });
    } catch {
      setConversations((prev) => {
        const latest = prev[reportId];
        return latest ? { ...prev, [reportId]: { ...latest, loadingOlder: false } } : prev;
      });
    }
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold mb-8">{t("reportsTitle")}</h1>

      {notice && (
        <div className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning mb-4">{notice}</div>
      )}

      {reports && reports.length === 0 && <p className="text-sm text-muted">{t("reportsEmpty")}</p>}

      <div className="flex flex-col gap-4">
        {reports?.map((report) => (
          <div key={report.id} className={ui.card + " p-5"}>
            <div className="flex items-center gap-2 mb-2">
              <span className={ui.badge("warning")}>{tReport(REASON_LABEL_KEY[report.reason] ?? "reasonOther")}</span>
            </div>
            <p className="text-sm text-muted mb-1">
              {t("reportedBy")}: {report.reporter?.name ?? report.reporter?.email ?? "—"}
              {report.reporter?.email && report.reporter?.name && ` (${report.reporter.email})`}
              {" · "}
              {report.reporter?.category ?? report.reporter?.role ?? "—"}
            </p>
            <p className="text-sm text-muted mb-3">
              {t("against")}: {report.reported?.name ?? report.reported?.email ?? "—"}
              {report.reported?.email && report.reported?.name && ` (${report.reported.email})`}
              {" · "}
              {report.reported?.category ?? report.reported?.role ?? "—"}
            </p>
            {report.post && (
              <p className="text-sm text-ink/80 mb-3 rounded-lg bg-surface-sunken px-3 py-2">
                {t("reportedPost")}: &ldquo;{report.post.caption}&rdquo;
              </p>
            )}
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
                {conversations[report.id]?.messages.length === 0 && (
                  <p className="text-sm text-muted">{t("noConversation")}</p>
                )}
                {conversations[report.id]?.hasOlder && (
                  <button
                    type="button"
                    onClick={() => loadOlder(report.id)}
                    disabled={conversations[report.id]?.loadingOlder}
                    className={ui.link + " text-xs self-center"}
                  >
                    {conversations[report.id]?.loadingOlder ? tMatches("loadingMore") : tMatches("loadEarlierMessages")}
                  </button>
                )}
                {conversations[report.id]?.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                      m.isReporter ? "self-start bg-surface border border-border" : "self-end bg-primary text-white"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide opacity-70 mb-0.5">
                      {m.isReporter ? t("reporterLabel") : t("reportedLabel")}
                    </p>
                    {m.audioUrl ? (
                      <audio controls preload="metadata" src={m.audioUrl} className="h-9 w-56 max-w-full" />
                    ) : (
                      m.body
                    )}
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
