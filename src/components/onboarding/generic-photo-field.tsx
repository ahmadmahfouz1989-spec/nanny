"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ui } from "@/lib/ui";

/**
 * Optional profile photo for a generic-category onboarding/edit form
 * (nursing, tutoring, ...). The profile row already exists by the time a
 * form renders (claimed as a draft the moment a role is picked), so the
 * upload is always staged against it: the file lands in storage, but the
 * profile only points at it once the form's own Save sends
 * profilePhotoUrl -- Cancel leaves the saved profile untouched.
 */
export default function GenericPhotoField({
  profileId,
  value,
  onChange,
  onError,
}: {
  profileId: string;
  value: string | null;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("ParentOnboarding");
  const tw = useTranslations("Wizard");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("genericProfileId", profileId);
    formData.append("stage", "true");

    try {
      const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
      if (!res.ok) {
        onError(tw("genericError"));
        return;
      }
      const body = await res.json();
      onChange(body.url);
    } catch {
      onError(tw("genericError"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted overflow-hidden hover:border-primary/50 transition-colors"
      >
        {value ? (
          <Image src={value} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <div className="text-sm">
        <button type="button" onClick={() => fileInputRef.current?.click()} className={ui.link}>
          {value ? t("changePhoto") : t("uploadPhoto")}
        </button>
        <p className="text-xs text-muted mt-0.5">{uploading ? t("uploading") : t("photoHint")}</p>
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
