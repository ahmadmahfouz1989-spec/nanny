"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import ProfileRating from "@/components/matches/profile-rating";
import MatchActions from "@/components/matches/match-actions";
import GenericMatchActions from "@/components/matches/generic-match-actions";
import ProfileSummaryPanel from "@/components/profile-summary-panel";
import { ui } from "@/lib/ui";
import { useToast } from "@/components/toast-provider";
import { useSavedProfiles } from "@/components/saved-profiles-provider";
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
  const { setSaved } = useSavedProfiles();
  const [open, setOpen] = useState(false);

  // Both mutations update the list optimistically for a snappy toggle, but
  // must roll back on failure -- previously they always kept the optimistic
  // state and never checked the response, so a failed request looked
  // identical to a successful one until the next reload silently reversed
  // it. Both also keep SavedProfilesProvider in step, so every bookmark
  // for this profile (including one in an open preview) agrees.
  async function remove() {
    onRemoved(item);
    setSaved(item.type, item.targetProfileId, false);
    const res = await fetch(`/api/saved-profiles/${item.type}/${item.targetProfileId}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      onRestored(item);
      setSaved(item.type, item.targetProfileId, true);
      show({ message: t("removeError"), tone: "error" });
      return;
    }

    // The toast's Undo stays clickable until it auto-dismisses -- only the
    // first click may act, or a double click would restore the card twice.
    let undoUsed = false;
    async function undo() {
      if (undoUsed) return;
      undoUsed = true;
      onRestored(item);
      setSaved(item.type, item.targetProfileId, true);
      const res = await fetch(`/api/saved-profiles/${item.type}/${item.targetProfileId}`, { method: "PUT" }).catch(() => null);
      if (!res || !res.ok) {
        onRemoved(item);
        setSaved(item.type, item.targetProfileId, false);
        show({ message: t("saveError"), tone: "error" });
        return;
      }
      // Re-saving creates a new favorites row -- adopt its id/savedAt
      // instead of the deleted row's.
      const body = await res.json().catch(() => null);
      const favorite = body?.favorite as { id: string; created_at: string } | null | undefined;
      if (favorite) onRestored({ ...item, id: favorite.id, savedAt: favorite.created_at });
    }

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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="absolute bottom-0 start-0 p-4 text-start"
          aria-expanded={open}
        >
          <p className="font-display text-lg font-bold text-white drop-shadow underline-offset-2 hover:underline">
            {profile.displayName}
          </p>
          <p className="text-xs text-white/90 drop-shadow">
            {categoryLabel}
            {area ? ` · ${area}` : ""}
          </p>
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={ui.badge("secondary")}>{profile.role === "seeking" ? t("roleSeeking") : t("roleOffering")}</span>
          <ProfileRating profileId={profile.id} profileType={profile.type} average={profile.rating.average} count={profile.rating.count} />
        </div>

        <button type="button" onClick={() => setOpen((v) => !v)} className={ui.buttonGhost + " text-sm mb-3"}>
          {open ? t("hideProfile") : t("viewProfile")}
        </button>

        {open && <ProfileSummaryPanel profileType={profile.type} profileId={profile.id} />}

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
