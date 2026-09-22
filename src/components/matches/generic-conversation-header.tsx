"use client";

import { useTranslations } from "next-intl";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import RatingButton from "@/components/matches/rating-button";
import ReportButton from "@/components/matches/report-button";
import { useState } from "react";
import { MoreIcon } from "@/components/nav-icons";
import { ui } from "@/lib/ui";

type ContactInfo = { phone: string | null; email: string | null; whatsappUrl: string | null };

/**
 * The generic-category equivalent of ConversationHeader. Still scoped
 * down from it in one way: no profile-summary panel here yet -- that's
 * still nanny/parent-only. Contact-reveal and reporting now match
 * nanny/parent exactly.
 */
export default function GenericConversationHeader({
  matchId,
  matchSource,
  name,
  profileId,
  tone,
  onBack,
}: {
  matchId: string;
  matchSource: string;
  name: string;
  profileId: string;
  tone: "primary" | "secondary" | "berry";
  onBack?: () => void;
}) {
  const t = useTranslations("Matches");
  const tInbox = useTranslations("Inbox");
  const [menuOpen, setMenuOpen] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadContact() {
    setLoading(true);
    const res = await fetch(`/api/generic-matches/${matchId}/contact`);
    setLoading(false);
    if (res.ok) setContact(await res.json());
  }

  return (
    <div className="border-b border-border shrink-0">
      <div className="relative flex items-center gap-3 px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={tInbox("backToList")}
            className="sm:hidden -ms-1 text-ink/70 hover:text-ink shrink-0"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:scale-x-[-1]" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <AvatarIllustration tone={tone} className="h-10 w-10 rounded-full shrink-0" />
          <span className="font-display font-semibold min-w-0 truncate">{name}</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={tInbox("menu")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          <MoreIcon className="h-5 w-5" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute top-full end-4 mt-1 w-64 rounded-xl border border-border bg-surface shadow-lg p-3 z-20 flex flex-col gap-2">
              {!contact ? (
                <button
                  type="button"
                  onClick={loadContact}
                  disabled={loading}
                  className={ui.buttonSecondary + " text-sm justify-start"}
                >
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
              <div className="border-t border-border pt-2">
                <RatingButton matchId={matchId} counterpartName={name} apiBase="/api/generic-matches" />
              </div>
              <div className="border-t border-border pt-2">
                <ReportButton profileId={profileId} profileType="generic" matchId={matchId} matchSource={matchSource} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
