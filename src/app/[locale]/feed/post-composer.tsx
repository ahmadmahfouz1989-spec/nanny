"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PostIdentityOption } from "@/lib/post-identities";
import { ui } from "@/lib/ui";
import { Avatar } from "./feed-shared";

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
}) {
  const t = useTranslations("Feed");
  const tSaved = useTranslations("SavedProfiles");
  const locale = useLocale();

  function identityLabel(identity: PostIdentityOption) {
    const categoryName = locale === "ar" ? identity.categoryNameAr : identity.categoryNameEn;
    const roleLabel = identity.role === "provider" ? tSaved("roleOffering") : tSaved("roleSeeking");
    return `${categoryName} · ${roleLabel} — ${identity.fullName}`;
  }

  return (
    <div className="flex gap-3 p-4 border-b border-border">
      <Avatar photoUrl={avatarUrl} size={44} className="mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {identities && identities.length > 1 && (
          <select
            className={ui.select + " w-auto text-xs py-1.5"}
            value={selectedProfileId ?? ""}
            onChange={(e) => onSelectIdentity(e.target.value)}
          >
            {identities.map((identity) => (
              <option key={identity.profileId} value={identity.profileId}>
                {identityLabel(identity)}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => onKind("looking_for")} className={ui.pill(kind === "looking_for")}>
            {t("kindLookingFor")}
          </button>
          <button type="button" onClick={() => onKind("offering")} className={ui.pill(kind === "offering")}>
            {t("kindOffering")}
          </button>
        </div>
        <textarea
          dir="auto"
          className="w-full resize-none border-none bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          rows={2}
          maxLength={500}
          placeholder={t("captionPlaceholder")}
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onSubmit} disabled={posting || !caption.trim() || identities === null} className={ui.buttonPrimary + " px-5! py-2!"}>
            {posting ? t("posting") : t("post")}
          </button>
        </div>
      </div>
    </div>
  );
}
