"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import ReportButton from "@/components/matches/report-button";
import RatingButton from "@/components/matches/rating-button";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { ui } from "@/lib/ui";

type ContactInfo = { phone: string | null; email: string | null; whatsappUrl: string | null };

export default function ConversationHeader({
  matchId,
  name,
  photoUrl,
  tone,
  profileId,
  profileType,
  onBack,
}: {
  matchId: string;
  name: string;
  photoUrl: string | null;
  tone: "primary" | "secondary" | "berry";
  profileId: string;
  profileType: "parent" | "nanny";
  onBack?: () => void;
}) {
  const t = useTranslations("Matches");
  const tInbox = useTranslations("Inbox");
  const [menuOpen, setMenuOpen] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadContact() {
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/contact`);
    setLoading(false);
    if (res.ok) setContact(await res.json());
  }

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
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
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <AvatarIllustration tone={tone} className="h-10 w-10 rounded-full shrink-0" />
      )}
      <p className="font-display font-semibold flex-1 min-w-0 truncate">{name}</p>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={tInbox("menu")}
        className={ui.buttonGhost + " px-2! py-2! text-lg leading-none"}
      >
        ⋯
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
              <RatingButton matchId={matchId} counterpartName={name} />
            </div>
            <div className="border-t border-border pt-2">
              <ReportButton profileId={profileId} profileType={profileType} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
