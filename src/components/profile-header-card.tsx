"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";

const MODERATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

/**
 * Identity block for one of the account's profiles on the /profile page:
 * editable photo, name, category/role, review status and the actions that
 * matter. An account can hold several profiles, each with its own photo.
 */
export default function ProfileHeaderCard({
  profileId,
  initialPhotoUrl,
  slug,
  role,
  categoryLabel,
  roleLabel,
  fullName,
  moderationStatus,
}: {
  profileId: string;
  initialPhotoUrl: string | null;
  slug: string;
  role: "seeker" | "provider";
  categoryLabel: string;
  roleLabel: string;
  fullName: string | null;
  moderationStatus: string;
}) {
  const t = useTranslations("Dashboard");
  const tNanny = useTranslations("NannyOnboarding");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  // A new photo goes back to admin review, same as nanny/parent.
  const [status, setStatus] = useState(moderationStatus);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const tone = MODERATION_TONE[status] ?? "warning";

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setPhotoError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("genericProfileId", profileId);

    try {
      const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
      if (!res.ok) {
        setPhotoError(t("photoUpdateError"));
        return;
      }
      const body = await res.json();
      setPhotoUrl(body.url);
      setStatus("pending");
    } catch {
      setPhotoError(t("photoUpdateError"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className={ui.card + " p-6"}>
      <div className="flex items-start gap-4">
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
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold truncate">{fullName ?? categoryLabel}</p>
          <p className="text-sm text-muted">
            {categoryLabel} · {roleLabel}
          </p>
          <span className={ui.badge(tone) + " mt-1.5 inline-block"}>
            {status === "approved" && t("statusApproved")}
            {status === "pending" && t("statusPending")}
            {status === "rejected" && t("statusRejected")}
          </span>
        </div>
      </div>

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

      <p className="text-sm text-muted mt-4">
        {status === "approved" && t("descriptionApproved")}
        {status === "pending" && t("descriptionPending")}
        {status === "rejected" && t("descriptionRejected")}
      </p>

      <div className="flex items-center gap-3 mt-4">
        {status === "approved" && (
          <Link href={`/categories/${slug}/dashboard`} className={ui.buttonPrimary}>
            {t("viewMatches")}
          </Link>
        )}
        {/* ?role= so an account with both roles in this category edits
            this one, not whichever the onboarding page defaults to. */}
        <Link href={`/categories/${slug}/onboarding?role=${role}`} className={ui.buttonSecondary}>
          {t("editProfile")}
        </Link>
      </div>
    </div>
  );
}
