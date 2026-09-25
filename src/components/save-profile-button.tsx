"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BookmarkIcon } from "@/components/nav-icons";
import { useSavedProfiles } from "@/components/saved-profiles-provider";
import { useToast } from "@/components/toast-provider";

type SaveProfileButtonProps = {
  profileId: string;
  initialSaved: boolean;
  className?: string;
};

/**
 * Save/unsave bookmark, consistent everywhere a profile is shown
 * (discovery cards, the profile preview, the Saved page itself). Never
 * opens the profile or sends interest -- stopPropagation guards against a
 * future card-level click-to-open wrapper, even though none of today's
 * cards have one.
 */
export default function SaveProfileButton({ profileId, initialSaved, className = "" }: SaveProfileButtonProps) {
  const t = useTranslations("SavedProfiles");
  const router = useRouter();
  const { show } = useToast();
  const { isSaved, setSaved } = useSavedProfiles();
  const [pending, setPending] = useState(false);

  const saved = isSaved(profileId, initialSaved);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (pending) return;

    const nextSaved = !saved;
    setPending(true);
    setSaved(profileId, nextSaved);

    try {
      const res = await fetch(`/api/saved-profiles/${profileId}`, {
        method: nextSaved ? "PUT" : "DELETE",
      });

      if (!res.ok) {
        setSaved(profileId, saved);
        show({ message: nextSaved ? t("saveError") : t("removeError"), tone: "error", actionLabel: t("retry"), onAction: () => toggle(e) });
        return;
      }

      if (nextSaved) {
        show({ message: t("savedToast"), actionLabel: t("viewSavedLink"), onAction: () => router.push("/saved") });
      }
    } catch {
      setSaved(profileId, saved);
      show({ message: nextSaved ? t("saveError") : t("removeError"), tone: "error", actionLabel: t("retry"), onAction: () => toggle(e) });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={saved ? t("removeLabel") : t("saveLabel")}
      aria-pressed={saved}
      className={className}
    >
      <BookmarkIcon className="h-[18px] w-[18px]" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
