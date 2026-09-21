"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import RatingButton from "./rating-button";
import { ui } from "@/lib/ui";

function effectiveStatus(status: string, interestExpiresAt: string | null) {
  const pending = status === "seeker_interested" || status === "provider_interested";
  if (pending && interestExpiresAt && new Date(interestExpiresAt) < new Date()) return "expired";
  return status;
}

/**
 * The generic-category equivalent of MatchActions, scoped down for v1: no
 * contact-reveal -- once mutual, this links out to the unified /messages
 * inbox (same one nanny/parent uses), plus the same rate-your-match
 * widget legacy matches have.
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
  const [loading, setLoading] = useState(false);
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
        <Link href={`/messages?match=${matchId}`} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
          {t("openChat")}
        </Link>
        <RatingButton matchId={matchId} apiBase="/api/generic-matches" />
      </div>
    );
  }

  if (current.startsWith("declined_by_")) {
    return <p className="text-sm text-muted mt-3">{t("declined")}</p>;
  }

  return null;
}
