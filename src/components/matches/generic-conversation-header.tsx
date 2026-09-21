"use client";

import { useTranslations } from "next-intl";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import RatingButton from "@/components/matches/rating-button";
import { useState } from "react";
import { MoreIcon } from "@/components/nav-icons";

/**
 * The generic-category equivalent of ConversationHeader, scoped down to
 * what nursing/tutoring conversations already have: no contact-reveal,
 * report, or profile-summary panel -- those are nanny/parent-only
 * features, a separate gap from unifying where conversations show up.
 */
export default function GenericConversationHeader({
  matchId,
  name,
  tone,
  onBack,
}: {
  matchId: string;
  name: string;
  tone: "primary" | "secondary" | "berry";
  onBack?: () => void;
}) {
  const tInbox = useTranslations("Inbox");
  const [menuOpen, setMenuOpen] = useState(false);

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
            <div className="absolute top-full end-4 mt-1 w-64 rounded-xl border border-border bg-surface shadow-lg p-3 z-20">
              <RatingButton matchId={matchId} counterpartName={name} apiBase="/api/generic-matches" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
