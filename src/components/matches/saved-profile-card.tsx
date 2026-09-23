"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import ProfileRating from "@/components/matches/profile-rating";
import MatchActions from "@/components/matches/match-actions";
import GenericMatchActions from "@/components/matches/generic-match-actions";
import { ui } from "@/lib/ui";
import { useToast } from "@/components/toast-provider";
import type { SavedListItem } from "@/lib/saved-profiles";

function localizedLocationName(loc: { name_en: string; name_ar: string; name_fr: string } | null, locale: string) {
  if (!loc) return null;
  if (locale === "ar") return loc.name_ar;
  if (locale === "fr") return loc.name_fr;
  return loc.name_en;
}

export default function SavedProfileCard({
  item,
  tone,
  onRemoved,
  onRestored,
}: {
  item: SavedListItem;
  tone: "primary" | "secondary" | "berry";
  onRemoved: (item: SavedListItem) => void;
  onRestored: (item: SavedListItem) => void;
}) {
  const t = useTranslations("SavedProfiles");
  const tNav = useTranslations("Nav");
  const locale = useLocale();
  const { show } = useToast();

  async function undo() {
    onRestored(item);
    await fetch(`/api/saved-profiles/${item.type}/${item.targetProfileId}`, { method: "PUT" });
  }

  async function remove() {
    onRemoved(item);
    await fetch(`/api/saved-profiles/${item.type}/${item.targetProfileId}`, { method: "DELETE" });
    show({ message: t("removedToast"), actionLabel: t("undo"), onAction: undo });
  }

  if (!item.profile) {
    return (
      <div className={ui.card + " p-5 flex flex-col gap-3"}>
        <div>
          <p className="font-display font-semibold text-ink">{t("unavailableTitle")}</p>
          <p className="text-sm text-muted mt-1">{t("unavailableBody")}</p>
        </div>
        <button type="button" onClick={remove} className={ui.buttonGhost + " self-start text-sm"}>
          {t("remove")}
        </button>
      </div>
    );
  }

  const { profile, match } = item;
  const area = localizedLocationName(profile.locationLabel, locale);
  const categoryLabel = profile.category === "nanny" ? tNav("nanny") : profile.category === "nursing" ? tNav("nursing") : tNav("tutoring");

  return (
    <div className={ui.cardHover + " overflow-hidden"}>
      <div className="relative">
        {profile.photoUrl ? (
          <Image src={profile.photoUrl} alt="" width={640} height={160} unoptimized className="h-28 w-full object-cover" />
        ) : (
          <AvatarIllustration tone={tone} className="h-28 w-full" />
        )}
        {profile.photoUrl && <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />}
        {match && (
          <span className={ui.badge(ui.scoreTone(match.score)) + " absolute top-3 end-3 bg-surface/90!"}>
            {t("scoreLabel", { score: Math.round(match.score) })}
          </span>
        )}
        <div className="absolute bottom-0 start-0 p-4">
          <p className="font-display text-lg font-bold text-white drop-shadow">{profile.displayName}</p>
          <p className="text-xs text-white/90 drop-shadow">
            {categoryLabel}
            {area ? ` · ${area}` : ""}
          </p>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={ui.badge("secondary")}>{profile.role === "seeking" ? t("roleSeeking") : t("roleOffering")}</span>
          <ProfileRating profileId={profile.id} profileType={profile.type} average={profile.rating.average} count={profile.rating.count} />
        </div>

        {match && item.type !== "generic" && (
          <MatchActions
            matchId={match.id}
            status={match.status}
            interestExpiresAt={match.interestExpiresAt}
            viewerSide={match.viewerSide as "parent" | "nanny"}
          />
        )}
        {match && item.type === "generic" && (
          <GenericMatchActions
            matchId={match.id}
            status={match.status}
            interestExpiresAt={match.interestExpiresAt}
            viewerSide={match.viewerSide as "seeker" | "provider"}
          />
        )}

        <button type="button" onClick={remove} className={ui.buttonGhost + " text-sm mt-3 px-0!"}>
          {t("remove")}
        </button>
      </div>
    </div>
  );
}
