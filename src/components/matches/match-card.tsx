"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import CriteriaChecklist from "./criteria-checklist";
import MatchActions from "./match-actions";
import MatchDetails from "./match-details";
import ProfileRating from "./profile-rating";
import ReportButton from "./report-button";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import SaveProfileButton from "@/components/save-profile-button";
import type { CriterionResult } from "@/lib/matching/generic-engine";
import { DAYS } from "@/lib/validation/profile";
import { formatHoursRange } from "@/lib/format-hours";
import { ui } from "@/lib/ui";

export type OtherProfile = {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  location_id: string | null;
  attributes: Record<string, unknown>;
  locations: { name_en: string; name_ar: string; name_fr: string } | null;
  languages: { id: string; name_en: string; name_ar: string; name_fr: string }[];
};

export type Match = {
  id: string;
  score: number;
  score_breakdown: Record<string, CriterionResult>;
  status: string;
  interest_expires_at: string | null;
  other: OtherProfile;
  rating: { average: number | null; count: number };
  featured: boolean;
  isSaved: boolean;
};

function localizedLocationName(loc: OtherProfile["locations"], locale: string) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

/** One match on a category's match list, in any category. */
export default function MatchCard({
  match,
  viewerSide,
  tone,
}: {
  match: Match;
  viewerSide: "seeker" | "provider" | null;
  tone: "primary" | "secondary" | "berry";
}) {
  const t = useTranslations("Matches");
  const tDays = useTranslations("Days");
  const locale = useLocale();

  const other = match.other;
  const a = other.attributes ?? {};
  const gov = localizedLocationName(other.locations, locale);
  const area = [gov, typeof a.locationDetail === "string" ? a.locationDetail : null].filter(Boolean).join(", ");
  const headline = [
    area,
    typeof a.yearsExperience === "number" ? t("yearsExperience", { years: a.yearsExperience }) : null,
    typeof a.numChildren === "number" ? t("children", { count: a.numChildren }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const availability = a.availability as { days?: string[]; startTime?: string; endTime?: string } | undefined;
  const availableDays = (availability?.days ?? a.neededDays ?? []) as string[];
  const availableHours = formatHoursRange(availability?.startTime, availability?.endTime, locale);

  return (
    <div id={`match-${match.id}`} className={ui.cardHover + " oui-in overflow-hidden scroll-mt-6"}>
      <div className="relative">
        {other.profile_photo_url ? (
          <Image
            src={other.profile_photo_url}
            alt=""
            width={640}
            height={160}
            unoptimized
            className="h-28 w-full object-cover"
          />
        ) : (
          <AvatarIllustration tone={tone} banner className="h-28 w-full" />
        )}
        {other.profile_photo_url && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
        )}
        {match.featured && (
          <span className="absolute top-3 start-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            <span aria-hidden>★</span>
            {t("featuredBadge")}
          </span>
        )}
        <span className={ui.badge(ui.scoreTone(match.score)) + " absolute top-3 end-3 bg-surface/90!"}>
          {t("scoreLabel", { score: Math.round(match.score) })}
        </span>
        <SaveProfileButton
          profileId={other.id}
          initialSaved={match.isSaved}
          className="absolute bottom-3 end-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm transition hover:bg-surface"
        />
        <div className="absolute bottom-0 start-0 p-4">
          <p className="font-display text-lg font-bold text-white drop-shadow">{other.full_name}</p>
          {headline && <p className="text-xs text-white/90 drop-shadow">{headline}</p>}
        </div>
      </div>

      <div className="p-5">
        {(match.rating?.count ?? 0) > 0 && (
          <div className="mb-3">
            <ProfileRating
              profileId={other.id}
              average={match.rating?.average ?? null}
              count={match.rating?.count ?? 0}
            />
          </div>
        )}

        {availableDays.length > 0 && (
          <div className="mb-3">
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => (
                <div key={day} className={ui.dayChip(availableDays.includes(day))}>
                  {tDays(day)}
                </div>
              ))}
            </div>
            {availableHours && <p className="text-xs text-muted mt-1.5">{availableHours}</p>}
          </div>
        )}

        {typeof a.shortIntro === "string" && <p dir="auto" className="text-sm text-ink/80 mb-3">{a.shortIntro}</p>}
        {typeof a.jobDescription === "string" && <p dir="auto" className="text-sm text-ink/80 mb-3">{a.jobDescription}</p>}
        {typeof a.familyDescription === "string" && (
          <p dir="auto" className="text-sm text-ink/80 mb-3">{a.familyDescription}</p>
        )}

        <MatchDetails profile={other} />

        <CriteriaChecklist breakdown={match.score_breakdown} />
        {viewerSide && (
          <MatchActions
            matchId={match.id}
            status={match.status}
            viewerSide={viewerSide}
          />
        )}
        <ReportButton profileId={other.id} matchId={match.id} />
      </div>
    </div>
  );
}
