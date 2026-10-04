/**
 * What a notification says and where it leads -- shared by the in-app bell
 * and web push, so both read the same. Paths are locale-less; prefix
 * `/${locale}` when building a full URL outside next-intl's router.
 */

export type NotificationLike = {
  type: string;
  payload: Record<string, unknown> | null;
};

// next-intl's translator for the "Notifications" namespace (untyped keys).
type Translate = (key: string, values?: Record<string, string | number>) => string;

const KNOWN_TYPES = new Set([
  "interest_accepted",
  "interest_received",
  "rating_received",
  "new_match",
  "profile_approved",
  "profile_rejected",
  "profile_pending_review",
  "verification_updated",
  "report_resolved",
  "post_reply",
  "post_like",
]);

// The app has no per-match detail route — match cards live on the
// dashboard, so match notifications deep-link to the specific card
// (?match=<id>, which the dashboard page also uses to pick the right
// seeking/offering tab); a rating you received opens the ratings section
// of your profile.
export function notificationHref(n: NotificationLike): string {
  const matchId = typeof n.payload?.generic_match_id === "string" ? n.payload.generic_match_id : null;
  const categorySlug = typeof n.payload?.category_slug === "string" ? n.payload.category_slug : null;
  switch (n.type) {
    case "interest_accepted":
    case "interest_received":
    case "new_match":
      return matchId && categorySlug ? `/categories/${categorySlug}/dashboard?match=${matchId}` : "/dashboard";
    case "rating_received":
      return "/profile#ratings";
    case "profile_approved":
    case "profile_rejected":
      return categorySlug ? `/categories/${categorySlug}/dashboard` : "/dashboard";
    case "profile_pending_review":
      return "/admin/profiles";
    case "verification_updated":
      return "/profile";
    case "post_reply":
    case "post_like": {
      // Deep-link to the post itself (and the reply, when there is one)
      // -- the feed loads it directly, regardless of how far back it is.
      const postId = typeof n.payload?.post_id === "string" ? n.payload.post_id : null;
      const replyId = typeof n.payload?.reply_id === "string" ? n.payload.reply_id : null;
      if (!postId) return "/feed";
      return replyId ? `/feed?post=${postId}&reply=${replyId}` : `/feed?post=${postId}`;
    }
    default:
      return "/dashboard";
  }
}

export function notificationLabel(n: NotificationLike, t: Translate): string {
  if (n.type === "rating_received") {
    const score = typeof n.payload?.score === "number" ? (n.payload.score as number) : null;
    return score ? t("rating_received", { score }) : t("rating_received_generic");
  }
  return KNOWN_TYPES.has(n.type) ? t(n.type) : t("generic");
}
