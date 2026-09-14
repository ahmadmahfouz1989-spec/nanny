"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

/**
 * Standalone "change photo" control for an existing, already-approved
 * profile -- updating just the photo shouldn't mean walking all 7 steps
 * of the onboarding wizard again. /api/profile/photo saves the new URL to
 * the profile row itself, so this needs no separate save step of its own.
 */
export default function ProfilePhotoCard({ initialPhotoUrl }: { initialPhotoUrl: string | null }) {
  const t = useTranslations("NannyOnboarding");
  const tDashboard = useTranslations("Dashboard");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
    setUploading(false);

    if (!res.ok) {
      setError(tDashboard("photoUpdateError"));
      return;
    }

    const body = await res.json();
    setPhotoUrl(body.url);
    setSaved(true);
    // Clear the file input so choosing the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className={ui.card + " p-6 mb-5 flex items-center gap-4"}>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
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
      <div className="text-sm">
        <button type="button" onClick={() => fileInputRef.current?.click()} className={ui.link}>
          {t("changePhoto")}
        </button>
        <p className="text-xs text-muted mt-0.5">
          {uploading ? t("uploading") : saved ? tDashboard("photoUpdateSaved") : t("photoHint")}
        </p>
        {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
