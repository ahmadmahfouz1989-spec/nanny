"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import CriteriaChecklist from "./criteria-checklist";
import MatchActions from "./match-actions";
import ProfileRating from "./profile-rating";
import ReportButton from "./report-button";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import SaveProfileButton from "@/components/save-profile-button";
import type { CriterionResult } from "@/lib/matching/generic-engine";
import { DAYS } from "@/lib/validation/profile";
import { formatHoursRange } from "@/lib/format-hours";
import { ui } from "@/lib/ui";
import { labelOr } from "@/lib/i18n-fallback";
import { ChevronDownIcon } from "@/components/home-icons";

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

/**
 * One match on a category's match list, in any category: who, where and
 * how good a fit up top, what they do as chips, availability in a line,
 * the "why" folded away. The name opens the full profile page.
 */
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
  const tTrade = useTranslations("Trades");
  const tSubject = useTranslations("Subjects");
  const tCare = useTranslations("CareSpecialties");
  const tErrand = useTranslations("ErrandServices");
  const locale = useLocale();

  const other = match.other;
  const a = other.attributes ?? {};
  const gov = localizedLocationName(other.locations, locale);
  const area = [gov, typeof a.locationDetail === "string" ? a.locationDetail : null].filter(Boolean).join(", ");
  const headline = [
    area,
    typeof a.yearsExperience === "number" && a.yearsExperience > 0 ? t("yearsExperience", { years: a.yearsExperience }) : null,
    typeof a.numChildren === "number" ? t("children", { count: a.numChildren }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const availability = a.availability as { days?: string[]; startTime?: string; endTime?: string } | undefined;
  const availableDays = (availability?.days ?? a.neededDays ?? []) as string[];
  const availableHours = formatHoursRange(availability?.startTime, availability?.endTime, locale);
  // In week order, as one line ("Mon, Tue, Wed · 8:00 AM – 4:00 PM").
  const daysLine = [DAYS.filter((d) => availableDays.includes(d)).map((d) => tDays(d)).join(locale === "ar" ? "، " : ", "), availableHours]
    .filter(Boolean)
    .join(" · ");
  // What they do (or need), as a few chips -- the thing people compare first.
  const skillGroups: [unknown, typeof tTrade][] = [
    [a.trades ?? a.tradesNeeded, tTrade],
    [a.subjects ?? a.subjectsNeeded, tSubject],
    [a.careSpecialties ?? a.careSpecialtiesNeeded, tCare],
    [a.errandServices ?? (typeof a.errandService === "string" ? [a.errandService] : undefined), tErrand],
  ];
  const skills = skillGroups
    .flatMap(([codes, tr]) => (Array.isArray(codes) ? (codes as string[]).map((c) => labelOr(tr, c)) : []))
    .slice(0, 4);
  const price = typeof a.priceNote === "string" && a.priceNote.trim() ? a.priceNote : null;
  // The full details live on the profile page; the card keeps a taste.
  const intro = [a.shortIntro, a.jobDescription, a.familyDescription].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );

  return (
    <div id={`match-${match.id}`} className={ui.card + " oui-in scroll-mt-6 p-4"}>
      {/* Who, where, how good a fit -- what people decide on first. */}
      <div className="flex items-start gap-3">
        <Link href={`/u/${other.id}`} className="shrink-0" aria-label={other.full_name}>
          {other.profile_photo_url ? (
            <Image src={other.profile_photo_url} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <AvatarIllustration tone={tone} className="h-14 w-14 rounded-full" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${other.id}`} className="block min-w-0">
            <p className="line-clamp-2 font-display text-base font-bold leading-tight text-ink hover:underline">{other.full_name}</p>
          </Link>
          {headline && <p className="mt-0.5 text-xs text-muted">{headline}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={ui.badge(ui.scoreTone(match.score)) + " py-0!"}>{t("scoreLabel", { score: Math.round(match.score) })}</span>
            {match.featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-ink">
                <span aria-hidden>★</span>
                {t("featuredBadge")}
              </span>
            )}
            {(match.rating?.count ?? 0) > 0 && (
              <ProfileRating profileId={other.id} average={match.rating?.average ?? null} count={match.rating?.count ?? 0} />
            )}
          </div>
        </div>
        <SaveProfileButton
          profileId={other.id}
          initialSaved={match.isSaved}
          className="-me-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-surface-sunken"
        />
      </div>

      {(skills.length > 0 || price) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span key={skill} className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink/80">
              {skill}
            </span>
          ))}
          {price && <span className="rounded-full bg-secondary-soft px-2.5 py-1 text-xs font-medium text-secondary">{price}</span>}
        </div>
      )}

      {daysLine && <p className="mt-2 text-xs text-muted">{daysLine}</p>}

      {intro && (
        <p dir="auto" className="mt-2 line-clamp-2 text-sm text-ink/80">
          {intro}
        </p>
      )}

      {/* The full reasoning stays one tap away rather than filling the card. */}
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-0.5">
            {t("whyMatch")}
            <ChevronDownIcon className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-2">
          <CriteriaChecklist breakdown={match.score_breakdown} />
        </div>
      </details>

      {viewerSide && <MatchActions matchId={match.id} status={match.status} viewerSide={viewerSide} />}
      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href={`/u/${other.id}`} className={ui.link + " text-sm"}>
          {t("viewProfile")}
        </Link>
        <ReportButton profileId={other.id} matchId={match.id} />
      </div>
    </div>
  );
}
