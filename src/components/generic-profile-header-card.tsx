import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AvatarIllustration from "@/components/illustrations/avatar-illustration";
import { ui } from "@/lib/ui";

const MODERATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
};

/**
 * Identity block for a nursing/tutoring profile on the account-wide
 * /profile page -- the generic-category counterpart of ProfileHeaderCard.
 * No photo upload here: generic_profiles has no photo column, unlike
 * nanny/parent, so this shows a plain avatar instead of an editable one.
 */
export default function GenericProfileHeaderCard({
  slug,
  role,
  categoryLabel,
  roleLabel,
  fullName,
  moderationStatus,
}: {
  slug: string;
  role: "seeker" | "provider";
  categoryLabel: string;
  roleLabel: string;
  fullName: string | null;
  moderationStatus: string;
}) {
  const t = useTranslations("Dashboard");
  const tone = MODERATION_TONE[moderationStatus] ?? "warning";

  return (
    <div className={ui.card + " p-6"}>
      <div className="flex items-start gap-4">
        <AvatarIllustration tone="secondary" className="h-16 w-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold truncate">{fullName ?? categoryLabel}</p>
          <p className="text-sm text-muted">
            {categoryLabel} · {roleLabel}
          </p>
          <span className={ui.badge(tone) + " mt-1.5 inline-block"}>
            {moderationStatus === "approved" && t("statusApproved")}
            {moderationStatus === "pending" && t("statusPending")}
            {moderationStatus === "rejected" && t("statusRejected")}
          </span>
        </div>
      </div>

      <p className="text-sm text-muted mt-4">
        {moderationStatus === "approved" && t("descriptionApproved")}
        {moderationStatus === "pending" && t("descriptionPending")}
        {moderationStatus === "rejected" && t("descriptionRejected")}
      </p>

      <div className="flex items-center gap-3 mt-4">
        {moderationStatus === "approved" && (
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
