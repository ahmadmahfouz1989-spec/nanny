"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PostIdentityOption } from "@/lib/post-identities";
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
  const locale = useLocale();

  // "The Haddad family (Nanny)": who the post shows as, in plain words.
  function identityLabel(identity: PostIdentityOption) {
    const categoryName = locale === "ar" ? identity.categoryNameAr : identity.categoryNameEn;
    return `${identity.fullName} (${categoryName})`;
  }

  return (
    <div className="flex gap-3 p-4 border-b border-border">
      <Avatar photoUrl={avatarUrl} size={44} className="mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => onKind("looking_for")} className={ui.pill(kind === "looking_for")}>
            {t("composeNeed")}
          </button>
          <button type="button" onClick={() => onKind("offering")} className={ui.pill(kind === "offering")}>
            {t("composeOffer")}
          </button>
        </div>
        <textarea
          id={POST_COMPOSER_INPUT_ID}
          dir="auto"
          className="w-full resize-none border-none bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          rows={2}
          maxLength={500}
          placeholder={t(kind === "looking_for" ? "placeholderNeed" : "placeholderOffer")}
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
        />
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
