"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shrinkImage } from "@/lib/shrink-image";
import { request } from "@/lib/request";
import type { PostIdentityOption } from "@/lib/post-identities";
import { Link } from "@/i18n/navigation";
import { ui } from "@/lib/ui";
import { Avatar } from "./feed-shared";

/** Lets the phone's floating "New post" button jump to the box. */
export const POST_COMPOSER_INPUT_ID = "post-composer-input";

/** New-post box at the top of the feed, posting as one of the viewer's profiles. */
export default function PostComposer({
  identities,
  selectedProfileId,
  onSelectIdentity,
  avatarUrl,
  kind,
  onKind,
  caption,
  onCaption,
  error,
  posting,
  onSubmit,
  onPhotos,
  photosKey,
}: {
  identities: PostIdentityOption[] | null;
  selectedProfileId: string | null;
  onSelectIdentity: (profileId: string) => void;
  avatarUrl: string | null;
  kind: "looking_for" | "offering";
  onKind: (kind: "looking_for" | "offering") => void;
  caption: string;
  onCaption: (value: string) => void;
  error: string | null;
  posting: boolean;
  onSubmit: () => void;
  /** The uploaded photos' links, and whether any is still uploading. */
  onPhotos: (urls: string[], uploading: boolean) => void;
  /** Changes after a post is sent: the photos start over. */
  photosKey: number;
}) {
  const t = useTranslations("Feed");
  const locale = useLocale();

  // "The Haddad family (Nanny)": who the post shows as, in plain words.
  function identityLabel(identity: PostIdentityOption) {
    const categoryName = locale === "ar" ? identity.categoryNameAr : identity.categoryNameEn;
    return `${identity.fullName} (${categoryName})`;
  }

  // Posting needs a profile (the post shows as one of them), so someone
  // without one is sent to make one instead of getting a box that can't post.
  if (identities?.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Avatar photoUrl={null} size={44} />
        <p className="flex-1 min-w-0 text-sm text-muted">{t("profileRequired")}</p>
        <Link href="/categories" className={ui.buttonPrimary + " shrink-0 px-4! py-2!"}>
          {t("createProfile")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-4 border-b border-border">
      <Avatar photoUrl={avatarUrl} size={44} className="mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => onKind("looking_for")} aria-pressed={kind === "looking_for"} className={ui.pill(kind === "looking_for")}>
            {t("composeNeed")}
          </button>
          <button type="button" onClick={() => onKind("offering")} aria-pressed={kind === "offering"} className={ui.pill(kind === "offering")}>
            {t("composeOffer")}
          </button>
        </div>
        <textarea
          id={POST_COMPOSER_INPUT_ID}
          dir="auto"
          className="w-full resize-none border-none bg-transparent text-[15px] text-ink placeholder:text-muted/65 focus:outline-none"
          rows={2}
          maxLength={500}
          placeholder={t(kind === "looking_for" ? "placeholderNeed" : "placeholderOffer")}
          aria-label={t(kind === "looking_for" ? "placeholderNeed" : "placeholderOffer")}
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
        />
        <ComposerPhotos key={photosKey} onChange={onPhotos} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {/* Which of your profiles the post shows as -- only a choice
              when you have more than one. */}
          {identities && identities.length > 1 && (
            <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted">
              <span className="shrink-0">{t("postingAs")}</span>
              <select
                className="min-w-0 truncate bg-transparent font-medium text-ink outline-none"
                value={selectedProfileId ?? ""}
                onChange={(e) => onSelectIdentity(e.target.value)}
              >
                {identities.map((identity) => (
                  <option key={identity.profileId} value={identity.profileId}>
                    {identityLabel(identity)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={onSubmit} disabled={posting || !caption.trim() || identities === null} className={ui.buttonPrimary + " px-5! py-2!"}>
            {posting ? t("posting") : t("post")}
          </button>
        </div>
      </div>
    </div>
  );
}

const MAX_PHOTOS = 4;
type PickedPhoto = { id: string; preview: string; url: string | null; failed: boolean };

/**
 * Photos for a post: up to 4, from the phone's gallery or straight from the
 * camera. Each is shrunk on the phone, then uploaded at once, so sending the
 * post is quick; a small preview shows each, with a way to remove it.
 */
function ComposerPhotos({ onChange }: { onChange: (urls: string[], uploading: boolean) => void }) {
  const t = useTranslations("Feed");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  });

  useEffect(() => {
    report.current(
      photos.filter((p) => p.url).map((p) => p.url!),
      photos.some((p) => !p.url && !p.failed),
    );
  }, [photos]);
  // Previews are local copies: let them go when the box is reset.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: FileList | null) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if ((files?.length ?? 0) > room) setError(t("photosMax", { max: MAX_PHOTOS }));
    for (const file of picked) {
      const id = crypto.randomUUID();
      setPhotos((list) => [...list, { id, preview: URL.createObjectURL(file), url: null, failed: false }]);
      const small = await shrinkImage(file);
      const form = new FormData();
      form.append("file", small);
      const res = await request("/api/post-photos", { method: "POST", body: form });
      const body = await res?.json().catch(() => null);
      if (res?.ok && typeof body?.url === "string") {
        setPhotos((list) => list.map((p) => (p.id === id ? { ...p, url: body.url } : p)));
      } else {
        setPhotos((list) => list.map((p) => (p.id === id ? { ...p, failed: true } : p)));
        setError(body?.code === "type" ? t("photoType") : body?.code === "size" ? t("photoSize") : t("photoFailed"));
      }
    }
  }

  function remove(id: string) {
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((p) => p.id !== id);
    });
  }

  const full = photos.length >= MAX_PHOTOS;
  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.url ? "" : "opacity-50"}`} />
              {!p.url && !p.failed && <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-ink">{t("photoUploading")}</span>}
              {p.failed && <span className="absolute inset-0 grid place-items-center bg-danger-soft/80 text-[11px] font-semibold text-danger">{t("photoFailedShort")}</span>}
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={t("photoRemove")}
                className="absolute end-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-1">
        <button type="button" disabled={full} onClick={() => gallery.current?.click()} className={ui.buttonGhost + " gap-1.5 px-2.5! py-1.5! text-ink/80"}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" strokeLinejoin="round" />
          </svg>
          {t("addPhoto")}
        </button>
        <button type="button" disabled={full} onClick={() => camera.current?.click()} className={ui.buttonGhost + " gap-1.5 px-2.5! py-1.5! text-ink/80"}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" strokeLinejoin="round" />
            <circle cx="12" cy="13.5" r="3.5" />
          </svg>
          {t("takePhoto")}
        </button>
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      </div>
    </div>
  );
}
