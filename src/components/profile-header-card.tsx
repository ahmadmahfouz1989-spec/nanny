"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { ui } from "@/lib/ui";

type MatchProfile = { status: string; moderation_status: string } | null;

const MODERATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

/**
 * The profile page's identity block: picture (editable for nannies, the
 * only role with a photo field), name, and profile status + the actions
 * that matter (View matches / Edit / Create), all in one place instead of
 * split between a page heading and a separate card with the same title
 * further down the page.
 */
export default function ProfileHeaderCard({
  fullName,
  roleLabel,
  isNanny,
  initialPhotoUrl,
  matchProfile,
}: {
  fullName: string | null;
  roleLabel: string;
  isNanny: boolean;
  initialPhotoUrl: string | null;
  matchProfile: MatchProfile;
}) {
  const t = useTranslations("Dashboard");
  const tNanny = useTranslations("NannyOnboarding");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setPhotoError(null);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      setPhotoError(t("photoUpdateError"));
      return;
    }

    const body = await res.json();
    setPhotoUrl(body.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const tone = MODERATION_TONE[matchProfile?.moderation_status ?? ""] ?? "warning";

  return (
    <div className={ui.card + " p-6 mb-5"}>
      <div className="flex items-start gap-4">
        {isNanny ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={tNanny("changePhoto")}
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted overflow-hidden hover:border-primary/50 transition-colors"
          >
            {photoUrl ? (
              <Image src={photoUrl} alt="" width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ) : (
          <AvatarIllustration tone="primary" className="h-16 w-16 rounded-full overflow-hidden shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold truncate">{fullName ?? roleLabel}</p>
          <p className="text-sm text-muted">{roleLabel}</p>
          {matchProfile && (
            <span className={ui.badge(tone) + " mt-1.5 inline-block"}>
              {matchProfile.moderation_status === "approved" && t("statusApproved")}
              {matchProfile.moderation_status === "pending" && t("statusPending")}
              {matchProfile.moderation_status === "rejected" && t("statusRejected")}
            </span>
          )}
        </div>
      </div>

      {isNanny && (
        <>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={ui.link + " text-xs mt-2"}>
            {tNanny("changePhoto")}
          </button>
          <p className="text-xs text-muted mt-0.5">{uploading ? tNanny("uploading") : tNanny("photoHint")}</p>
          {photoError && <p className="text-xs text-danger mt-0.5">{photoError}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </>
      )}

      <p className="text-sm text-muted mt-4">
        {matchProfile ? (
          <>
            {matchProfile.moderation_status === "approved" && t("descriptionApproved")}
            {matchProfile.moderation_status === "pending" && t("descriptionPending")}
            {matchProfile.moderation_status === "rejected" && t("descriptionRejected")}
          </>
        ) : (
          isNanny ? t("noProfileNanny") : t("noProfileParent")
        )}
      </p>

      <div className="flex items-center gap-3 mt-4">
        {matchProfile?.moderation_status === "approved" && (
          <Link href="/dashboard" className={ui.buttonPrimary}>
            {t("viewMatches")}
          </Link>
        )}
        <Link href="/onboarding" className={ui.buttonSecondary}>
          {matchProfile ? t("editProfile") : t("createProfile")}
        </Link>
      </div>
    </div>
  );
}
