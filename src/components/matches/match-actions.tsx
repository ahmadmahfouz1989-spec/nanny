"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { MATCHES_API, isBlocked, type MatchSide } from "@/lib/matching/match-access";
import { request } from "@/lib/request";

/**
 * Message / Not interested on a match card -- the same for every category.
 * Anyone can message a match straight away; "Not interested" blocks the
 * match, so neither side can write in it any more.
 */
export default function MatchActions({
  matchId,
  status,
  viewerSide,
}: {
  matchId: string;
  status: string;
  viewerSide: MatchSide;
}) {
  const t = useTranslations("Matches");
  const [current, setCurrent] = useState(status);
  // The list refreshes statuses in the background (useLiveMatches) -- adopt
  // a changed prop, e.g. the other side blocking, instead of freezing on
  // whatever the card mounted with. A block done here is never undone by a
  // refresh fetched before it.
  const [seenProp, setSeenProp] = useState(status);
  if (status !== seenProp) {
    setSeenProp(status);
    if (!isBlocked(current)) setCurrent(status);
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function notInterested() {
    setLoading(true);
    setError(null);
    const res = await request(`${MATCHES_API}/${matchId}/decline`, { method: "POST" });
    setLoading(false);

    if (!res || !res.ok) {
      const body = ((await res?.json().catch(() => ({}))) ?? {});
      setError(typeof body.error === "string" ? body.error : t("actionError"));
      return;
    }

    const body = await res.json();
    setCurrent(body.match.status);
  }

  async function undo() {
    setLoading(true);
    setError(null);
    const res = await request(`${MATCHES_API}/${matchId}/decline`, { method: "DELETE" });
    setLoading(false);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body?.match) {
      setError(typeof body?.error === "string" ? body.error : t("actionError"));
      return;
    }
    setCurrent(body.match.status);
  }

  if (isBlocked(current)) {
    const mine = current === `declined_by_${viewerSide}`;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{mine ? t("notInterestedDone") : t("conversationClosed")}</p>
        {/* A tap by mistake shouldn't close a match for good. */}
        {mine && (
          <button type="button" onClick={undo} disabled={loading} className={ui.link + " text-sm"}>
            {t("undoNotInterested")}
          </button>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mt-3">
      <Link href={`/messages?match=${matchId}`} className={ui.buttonPrimary + " px-5! py-2! text-sm"}>
        {t("sendMessage")}
      </Link>
      <button onClick={notInterested} disabled={loading} className={ui.buttonSecondary + " px-5! py-2! text-sm"}>
        {t("notInterested")}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
