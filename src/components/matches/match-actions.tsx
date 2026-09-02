"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import ChatThread from "./chat-thread";
import RatingButton from "./rating-button";
import SubscribeModal from "@/components/subscribe-modal";
import { ui } from "@/lib/ui";

type ContactInfo = { phone: string | null; email: string | null; whatsappUrl: string | null };

function effectiveStatus(status: string, interestExpiresAt: string | null) {
  const pending = status === "parent_interested" || status === "nanny_interested";
  if (pending && interestExpiresAt && new Date(interestExpiresAt) < new Date()) return "expired";
  return status;
}

export default function MatchActions({
  matchId,
  status,
  interestExpiresAt,
  viewerSide,
}: {
  matchId: string;
  status: string;
  interestExpiresAt: string | null;
  viewerSide: "parent" | "nanny";
}) {
  const t = useTranslations("Matches");
  const [current, setCurrent] = useState(effectiveStatus(status, interestExpiresAt));
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywalled, setPaywalled] = useState(false);

  const otherSide = viewerSide === "parent" ? "nanny" : "parent";
  const ownPending = `${viewerSide}_interested`;
  const otherPending = `${otherSide}_interested`;

  async function act(action: "interest" | "decline") {
    setLoading(true);
    setError(null);
    setPaywalled(false);
    const res = await fetch(`/api/matches/${matchId}/${action}`, { method: "POST" });
    setLoading(false);

    if (res.status === 402) {
      setPaywalled(true);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : t("actionError"));
      return;
    }

    const body = await res.json();
    setCurrent(body.match.status);
  }

  async function loadContact() {
    setLoading(true);
    setError(null);
    setPaywalled(false);
    const res = await fetch(`/api/matches/${matchId}/contact`);
    setLoading(false);

    if (res.status === 402) {
      setPaywalled(true);
      return;
    }
    if (!res.ok) {
      setError(t("actionError"));
      return;
    }
    setContact(await res.json());
  }

  const feedback = error ? <p className="text-xs text-danger">{error}</p> : null;

  let body: ReactNode = null;

  if (current === "suggested" || current === "expired") {
    body = (
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => act("interest")} disabled={loading} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
          {t("sendInterest")}
        </button>
        {feedback}
      </div>
    );
  } else if (current === ownPending) {
    body = <p className="text-sm text-muted mt-3">{t("waitingForResponse")}</p>;
  } else if (current === otherPending) {
    body = (
      <div className="flex flex-col gap-2 mt-3">
        <p className="text-sm text-secondary font-medium">{t("theyAreInterested")}</p>
        <div className="flex items-center gap-3">
          <button onClick={() => act("interest")} disabled={loading} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
            {t("accept")}
          </button>
          <button onClick={() => act("decline")} disabled={loading} className={ui.buttonSecondary + " px-5! py-2! text-sm"}>
            {t("decline")}
          </button>
        </div>
        {feedback}
      </div>
    );
  } else if (current === "mutual") {
    body = (
      <div className="mt-3">
        {!contact ? (
          <button onClick={loadContact} disabled={loading} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
            {t("viewContact")}
          </button>
        ) : (
          <div className="rounded-xl bg-secondary-soft p-3 text-sm flex flex-col gap-1">
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && <span>{contact.email}</span>}
            {contact.whatsappUrl && (
              <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" className={ui.link}>
                {t("openWhatsapp")}
              </a>
            )}
          </div>
        )}
        {feedback}
        <RatingButton matchId={matchId} />
        <ChatThread matchId={matchId} />
      </div>
    );
  } else if (current.startsWith("declined_by_")) {
    body = <p className="text-sm text-muted mt-3">{t("declined")}</p>;
  }

  return (
    <>
      {body}
      <SubscribeModal open={paywalled} onClose={() => setPaywalled(false)} />
    </>
  );
}
