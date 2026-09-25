"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import RatingButton from "./rating-button";
import { ui } from "@/lib/ui";

type ContactInfo = { phone: string | null; email: string | null; whatsappUrl: string | null };

function effectiveStatus(status: string, interestExpiresAt: string | null) {
  const pending = status === "seeker_interested" || status === "provider_interested";
  if (pending && interestExpiresAt && new Date(interestExpiresAt) < new Date()) return "expired";
  return status;
}

// How far along the interest flow a status is -- used so a server status
// that's older than an action just taken on this card can't roll it back.
function progress(status: string) {
  if (status === "mutual") return 2;
  if (status.startsWith("declined_by_")) return 3;
  if (status.endsWith("_interested")) return 1;
  return 0;
}

/**
 * The generic-category equivalent of MatchActions: once mutual, this
 * offers the same contact-reveal as nanny/parent (phone/email/WhatsApp),
 * plus a link into the unified /messages inbox (same one nanny/parent
 * uses) and the same rate-your-match widget legacy matches have.
 */
export default function GenericMatchActions({
  matchId,
  status,
  interestExpiresAt,
  viewerSide,
}: {
  matchId: string;
  status: string;
  interestExpiresAt: string | null;
  viewerSide: "seeker" | "provider";
}) {
  const t = useTranslations("Matches");
  const [current, setCurrent] = useState(effectiveStatus(status, interestExpiresAt));
  // The list refreshes statuses in the background (useLiveMatches) -- adopt
  // a changed prop, e.g. the other side accepting, instead of freezing on
  // whatever the card mounted with. After a local action, only move
  // forward: a refresh fetched before that action must not undo it.
  const [seenProp, setSeenProp] = useState(`${status}|${interestExpiresAt}`);
  const [actedLocally, setActedLocally] = useState(false);
  const propKey = `${status}|${interestExpiresAt}`;
  if (propKey !== seenProp) {
    setSeenProp(propKey);
    const next = effectiveStatus(status, interestExpiresAt);
    if (!actedLocally || progress(next) >= progress(current)) {
      setCurrent(next);
      setActedLocally(false);
    }
  }
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherSide = viewerSide === "seeker" ? "provider" : "seeker";
  const ownPending = `${viewerSide}_interested`;
  const otherPending = `${otherSide}_interested`;

  async function act(action: "interest" | "decline") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/generic-matches/${matchId}/${action}`, { method: "POST" });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : t("actionError"));
      return;
    }

    const body = await res.json();
    setCurrent(body.match.status);
    setActedLocally(true);
  }

  async function loadContact() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/generic-matches/${matchId}/contact`);
    setLoading(false);

    if (!res.ok) {
      setError(t("actionError"));
      return;
    }
    setContact(await res.json());
  }

  if (current === "suggested" || current === "expired") {
    return (
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => act("interest")} disabled={loading} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
          {t("sendInterest")}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (current === ownPending) {
    return <p className="text-sm text-muted mt-3">{t("waitingForResponse")}</p>;
  }

  if (current === otherPending) {
    return (
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
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (current === "mutual") {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-3">
          <Link href={`/messages?match=${matchId}`} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
            {t("openChat")}
          </Link>
          {!contact && (
            <button onClick={loadContact} disabled={loading} className={ui.buttonSecondary + " px-5! py-2! text-sm"}>
              {t("viewContact")}
            </button>
          )}
        </div>
        {contact && (
          <div className="rounded-xl bg-secondary-soft p-3 text-sm flex flex-col gap-1 mt-2">
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && <span>{contact.email}</span>}
            {contact.whatsappUrl && (
              <a href={contact.whatsappUrl} target="_blank" rel="noopener noreferrer" className={ui.link}>
                {t("openWhatsapp")}
              </a>
            )}
          </div>
        )}
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
        <RatingButton matchId={matchId} apiBase="/api/generic-matches" />
      </div>
    );
  }

  if (current.startsWith("declined_by_")) {
    return <p className="text-sm text-muted mt-3">{t("declined")}</p>;
  }

  return null;
}
