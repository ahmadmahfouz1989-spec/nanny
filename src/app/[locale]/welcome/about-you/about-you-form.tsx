"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { request } from "@/lib/request";
import { shrinkImage } from "@/lib/shrink-image";
import NationalitySelect from "@/components/onboarding/nationality-select";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import type { AccountBasics } from "@/lib/account-basics";

type Field = "fullName" | "contactPhone" | "nationality" | "photoUrl";

/** Name, phone, nationality and an optional photo: asked once, used by every service. */
export default function AboutYouForm({ initial, next }: { initial: AccountBasics; next: string }) {
  const t = useTranslations("AboutYou");
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [nationality, setNationality] = useState(initial.nationality ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: Field | null; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", await shrinkImage(file, 1200));
    const res = await request("/api/account/photo", { method: "POST", body: form });
    const body = await res?.json().catch(() => null);
    setUploading(false);
    if (res?.ok && typeof body?.url === "string") setPhotoUrl(body.url);
    else setError({ field: "photoUrl", text: body?.code === "size" ? t("photoSize") : body?.code === "type" ? t("photoType") : t("photoFailed") });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError({ field: "fullName", text: t("nameMissing") });
    if (!/^\+?[0-9 ()-]{6,20}$/.test(contactPhone.trim())) return setError({ field: "contactPhone", text: t("phoneMissing") });
    if (!nationality) return setError({ field: "nationality", text: t("nationalityMissing") });
    setSaving(true);
    const res = await request("/api/account/basics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: fullName.trim(), contactPhone: contactPhone.trim(), nationality, photoUrl }),
    });
    const body = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError({ field: (body?.field as Field) ?? null, text: typeof body?.error === "string" ? body.error : t("saveFailed") });
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const fieldError = (field: Field) =>
    error?.field === field ? (
      <p className="text-sm text-danger" role="alert">
        {error.text}
      </p>
    ) : null;

  return (
    <form onSubmit={save} className={ui.card + " flex flex-col gap-5 p-6 sm:p-8"}>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={photoUrl ? t("changePhoto") : t("addPhoto")}
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border"
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <AvatarIllustration name={fullName} className="h-full w-full rounded-full" />
          )}
        </button>
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={ui.link + " text-sm"}>
            {uploading ? t("uploading") : photoUrl ? t("changePhoto") : t("addPhoto")}
          </button>
          <p className="text-xs text-muted">{t("photoHint")}</p>
          {fieldError("photoUrl")}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={ui.label}>{t("name")}</span>
        <input id="about-name" className={ui.input} autoComplete="name" maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        {fieldError("fullName")}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={ui.label}>{t("phone")}</span>
        <input
          id="about-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="+961 3 123 456"
          className={ui.input + " text-start"}
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <span className="text-xs text-muted">{t("phoneHint")}</span>
        {fieldError("contactPhone")}
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={ui.label} id="about-nationality-label">
          {t("nationality")}
        </span>
        <div aria-labelledby="about-nationality-label">
          <NationalitySelect value={nationality} onChange={setNationality} />
        </div>
        {fieldError("nationality")}
      </div>

      {error && error.field === null && <p className="text-sm text-danger">{error.text}</p>}

      <button type="submit" disabled={saving || uploading} className={ui.buttonPrimary}>
        {saving ? t("saving") : t("continue")}
      </button>
    </form>
  );
}
